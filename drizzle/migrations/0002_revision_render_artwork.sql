ALTER TABLE design_revisions
  ADD COLUMN render_artwork_hashes text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE design_revisions
  ADD CONSTRAINT design_revisions_render_artwork_hashes_check
  CHECK (
    cardinality(render_artwork_hashes) = 0
    OR array_to_string(render_artwork_hashes, ',')
      ~ '^[0-9a-f]{64}(,[0-9a-f]{64})*$'
  );
