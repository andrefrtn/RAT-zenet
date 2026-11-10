import nodemailer from 'nodemailer';
import type { Settings } from './config.js';
import { displayDate, type Rat } from '../shared/rat.js';

export class MailError extends Error {
  constructor(public uncertain: boolean) {
    super(uncertain ? 'Aceitação SMTP indeterminada.' : 'Mensagem recusada pelo SMTP.');
  }
}

export function mailMessage(rat: Rat, id: string, filename: string, pdf: Buffer, from: string, to: string) {
  const date = displayDate(rat.date);
  return {
    from: { name: 'RAT Digital ZENET', address: from },
    to,
    messageId: '<' + id + '@rat.zenet.com.br>',
    subject: ['RAT ZENET Nº ' + rat.number, rat.client, date].join(' — '),
    text: [
      'Novo Relatório de Atendimento Técnico finalizado.',
      '',
      'Número do RAT: ' + rat.number,
      'Cliente: ' + rat.client,
      'Técnico: ' + rat.technician,
      'Data: ' + date,
      'Situação: ' + rat.status,
      '',
      'O relatório completo, incluindo as assinaturas, está disponível no PDF em anexo.',
    ].join('\n'),
    attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
  };
}

export type SendRat = (rat: Rat, id: string, filename: string, pdf: Buffer) => Promise<void>;

export function createSender(settings: Settings): SendRat {
  const recipient = settings.MAIL_TO;
  const transport = nodemailer.createTransport({
    host: settings.SMTP_HOST,
    port: settings.SMTP_PORT,
    secure: settings.SMTP_SECURE === 'true',
    requireTLS: settings.SMTP_SECURE !== 'true',
    auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASS },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return async (rat, id, filename, pdf) => {
    let accepted: (string | { address: string })[];
    try {
      const result = await transport.sendMail(mailMessage(rat, id, filename, pdf, settings.SMTP_FROM, recipient));
      accepted = result.accepted;
    } catch (error) {
      const smtp = error as {
        command?: string; responseCode?: number; code?: string; syscall?: string; timeoutType?: string;
      };
      const rejected = smtp.responseCode !== undefined && smtp.responseCode >= 400 && smtp.responseCode < 600;
      const beforeData = /^(?:EHLO|HELO|STARTTLS|AUTH(?: .*)?|MAIL FROM|RCPT TO)$/.test(smtp.command ?? '');
      // A socket close can be reported as CONN even after the server reads DATA.
      const duringSetup = smtp.syscall === 'connect' || ['EDNS', 'EAUTH'].includes(smtp.code ?? '') ||
        ['CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT'].includes(smtp.timeoutType ?? '');
      throw new MailError(!rejected && !beforeData && !duringSetup);
    }
    if (!accepted.some(entry => (typeof entry === 'string' ? entry : entry.address).toLowerCase() === recipient.toLowerCase())) {
      throw new MailError(false);
    }
  };
}
