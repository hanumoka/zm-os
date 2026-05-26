export type ZipLoadErrorCode =
  | 'INVALID_ZIP'
  | 'NOT_ZIP_MAGIC'
  | 'NO_MANIFEST'
  | 'NO_HTML'
  | 'MANIFEST_INVALID'
  | 'PATH_TRAVERSAL'
  | 'ZIP_TOO_LARGE'
  | 'HTML_TOO_LARGE'
  | 'BOMB'
  | 'DUPLICATE_ID';

export type ValidationError = {
  ok: false;
  code: ZipLoadErrorCode;
  message: string;
};
