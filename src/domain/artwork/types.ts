export const ARTWORK_PROCESSING_VERSION = "1.0.0-phase1f" as const;

export const ARTWORK_LIMITS = {
  rasterSourceMaxBytes: 10 * 1024 * 1024,
  svgSourceMaxBytes: 2 * 1024 * 1024,
  decodedMaxPixels: 40_000_000,
  canonicalLongestEdgePx: 2048,
  svgMaxElements: 5_000,
  svgMaxAttributes: 25_000,
} as const;

export type ArtworkMediaType = "image/png" | "image/jpeg" | "image/svg+xml";
export type ArtworkSide = "left" | "right";
export type ArtworkFit = "contain" | "cover";
export type ArtworkMapping = "linked" | "independent";

export type ArtworkBackground =
  | { readonly mode: "transparent" }
  | { readonly mode: "white"; readonly color: "#FFFFFF" }
  | { readonly mode: "navy"; readonly color: "#09245C" }
  | { readonly mode: "custom"; readonly color: string };

export interface ArtworkAsset {
  readonly assetId: string;
  readonly sourceContentHash: string;
  readonly renderContentHash: string;
  readonly originalFilename: string;
  readonly detectedMediaType: ArtworkMediaType;
  readonly sourceByteLength: number;
  readonly renderedByteLength: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly hasAlpha: boolean;
  readonly processingVersion: typeof ARTWORK_PROCESSING_VERSION;
  readonly svgSanitized: boolean;
  readonly rasterization: "browser_canvas_png";
  readonly createdAt: string;
  readonly status: "ready" | "missing" | "corrupt";
}

export interface ArtworkPlacement {
  readonly side: ArtworkSide;
  readonly assetId: string;
  readonly sourceContentHash: string;
  readonly renderContentHash: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly fit: ArtworkFit;
  readonly scalePermille: number;
  readonly offsetXBasisPoints: number;
  readonly offsetYBasisPoints: number;
  readonly rotationMilliDegrees: number;
  readonly background: ArtworkBackground;
  readonly showBleedGuide: boolean;
  readonly showSafeAreaGuide: boolean;
}

export interface ArtworkConfiguration {
  readonly schemaVersion: typeof ARTWORK_PROCESSING_VERSION;
  readonly mapping: ArtworkMapping;
  readonly left: ArtworkPlacement;
  readonly right: ArtworkPlacement;
}

export type ArtworkValidationFailureKind =
  | "empty_file"
  | "unsupported_pdf"
  | "unsupported_media_type"
  | "spoofed_media_type"
  | "source_too_large"
  | "corrupt_image"
  | "decoded_dimensions_too_large"
  | "jpeg_background_required"
  | "svg_script"
  | "svg_event_handler"
  | "svg_external_reference"
  | "svg_remote_font"
  | "svg_foreign_object"
  | "svg_active_content"
  | "svg_too_complex"
  | "svg_invalid"
  | "rasterization_failed"
  | "invalid_placement";

export type ArtworkStorageFailureKind =
  | "storage_unavailable"
  | "quota_exceeded"
  | "storage_capacity_low"
  | "missing_record"
  | "missing_blob"
  | "corrupt_hash"
  | "transaction_failed"
  | "referenced_content";

export interface ArtworkFailure<
  TKind extends ArtworkValidationFailureKind | ArtworkStorageFailureKind =
    | ArtworkValidationFailureKind
    | ArtworkStorageFailureKind,
> {
  readonly ok: false;
  readonly error: {
    readonly kind: TKind;
    readonly message: string;
    readonly recoverable: true;
  };
}

export interface ArtworkSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type ArtworkResult<
  T,
  TKind extends ArtworkValidationFailureKind | ArtworkStorageFailureKind =
    | ArtworkValidationFailureKind
    | ArtworkStorageFailureKind,
> = ArtworkSuccess<T> | ArtworkFailure<TKind>;

export interface ValidatedArtworkSource {
  readonly detectedMediaType: ArtworkMediaType;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly hasAlpha: boolean;
  readonly sanitizedSvgMarkup: string | null;
}

export interface ProcessedArtwork {
  readonly asset: ArtworkAsset;
  readonly sourceBlob: Blob;
  readonly renderedBlob: Blob;
  readonly warnings: readonly string[];
}
