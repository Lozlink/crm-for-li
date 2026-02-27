// Email sending abstraction
// Configure RESEND_API_KEY in environment variables
// Actual sending happens via a Supabase Edge Function, not directly from the client

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendBulkEmailParams {
  recipients: { to: string; mergeFields: Record<string, string> }[];
  subject: string;
  htmlTemplate: string;
  textTemplate?: string;
  from?: string;
}

// Merge field replacement: {{first_name}} → "Jason"
export function applyMergeFields(template: string, fields: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => fields[key] || '');
}
