export const MSG = {
  REWRITE_TEXT: "CHAMELEON_REWRITE_TEXT",
  APPLY_REWRITE: "CHAMELEON_APPLY_REWRITE",
  SAVE_LAST_SOURCE: "CHAMELEON_SAVE_LAST_SOURCE",
  GET_LAST_SOURCE: "CHAMELEON_GET_LAST_SOURCE",
  OPEN_OPTIONS: "CHAMELEON_OPEN_OPTIONS"
} as const;

export const STORAGE = {
  API_KEY: "chameleon_api_key",
  MODEL: "chameleon_model",
  LAST_SOURCE_TEXT: "chameleon_last_source_text"
} as const;

export const DEFAULT_MODEL = "gpt-5-mini";
