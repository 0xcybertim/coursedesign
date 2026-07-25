export type PersistenceFailureKind =
  | "validation"
  | "stale_version"
  | "missing_reference"
  | "asset_unavailable"
  | "session_invalid"
  | "forbidden"
  | "corrupt_record"
  | "unsupported_schema"
  | "temporarily_unavailable";

interface PersistenceFailureBase {
  readonly ok: false;
  readonly error: {
    readonly kind: PersistenceFailureKind;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export interface StaleVersionFailure<
  TLatest = unknown,
> extends PersistenceFailureBase {
  readonly error: PersistenceFailureBase["error"] & {
    readonly kind: "stale_version";
    readonly retryable: false;
    readonly expectedLockVersion: number;
    readonly actualLockVersion: number;
    readonly latest: TLatest;
  };
}

export type PersistenceFailure<TLatest = never> =
  | StaleVersionFailure<TLatest>
  | (PersistenceFailureBase & {
      readonly error: PersistenceFailureBase["error"] & {
        readonly kind: Exclude<PersistenceFailureKind, "stale_version">;
      };
    });

export interface PersistenceSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type PersistenceResult<T, TLatest = never> =
  | PersistenceSuccess<T>
  | PersistenceFailure<TLatest>;

export function persistenceFailure(
  kind: Exclude<PersistenceFailureKind, "stale_version">,
  message: string,
  retryable = kind === "temporarily_unavailable",
): PersistenceFailure<never> {
  return { ok: false, error: { kind, message, retryable } };
}

export function staleVersionFailure<TLatest>(input: {
  readonly expectedLockVersion: number;
  readonly actualLockVersion: number;
  readonly latest: TLatest;
}): StaleVersionFailure<TLatest> {
  return {
    ok: false,
    error: {
      kind: "stale_version",
      message:
        "This work changed in another context. Review the latest saved version before choosing how to recover your edit.",
      retryable: false,
      ...input,
    },
  };
}

export const PERSISTENCE_HTTP_STATUS: Readonly<
  Record<PersistenceFailureKind, number>
> = {
  validation: 400,
  stale_version: 409,
  missing_reference: 422,
  asset_unavailable: 422,
  session_invalid: 401,
  forbidden: 404,
  corrupt_record: 500,
  unsupported_schema: 409,
  temporarily_unavailable: 503,
};
