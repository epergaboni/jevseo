/**
 * Credential shape shared by the server store and the settings UI. No secrets
 * and no filesystem access live here, so a client component can import it.
 */

export const CREDENTIAL_KEYS = [
  "TYPESAFE_API_KEY",
  "TYPESAFE_MODEL",
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD",
] as const;

export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

export interface CredentialMeta {
  key: CredentialKey;
  label: string;
  service: "typesafe" | "dataforseo";
  required: boolean;
  secret: boolean;
  help: string;
}

export const CREDENTIAL_META: Record<CredentialKey, CredentialMeta> = {
  TYPESAFE_API_KEY: {
    key: "TYPESAFE_API_KEY",
    label: "TypeSafe API key",
    service: "typesafe",
    required: true,
    secret: true,
    help: "Powers every semantic judgment. Create one at console.typesafe.ai.",
  },
  TYPESAFE_MODEL: {
    key: "TYPESAFE_MODEL",
    label: "Jev model",
    service: "typesafe",
    required: false,
    secret: false,
    help: "Leave blank to track jev-latest. Pin a version such as jev-1.13.0 if you have tuned thresholds against it.",
  },
  DATAFORSEO_LOGIN: {
    key: "DATAFORSEO_LOGIN",
    label: "DataForSEO login",
    service: "dataforseo",
    required: false,
    secret: false,
    help: "The email address you sign in to DataForSEO with.",
  },
  DATAFORSEO_PASSWORD: {
    key: "DATAFORSEO_PASSWORD",
    label: "DataForSEO password",
    service: "dataforseo",
    required: false,
    secret: true,
    help: "The API password from your DataForSEO dashboard, not your account password.",
  },
};

export type CredentialSource = "env" | "local" | "none";

export interface CredentialStatus {
  key: CredentialKey;
  configured: boolean;
  source: CredentialSource;
  /** A masked hint, never the value itself. */
  preview: string | null;
}
