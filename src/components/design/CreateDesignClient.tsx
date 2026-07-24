import Link from "next/link";
import { PrototypeBoundary } from "@/components/shared/PrototypeBoundary";

export function CreateDesignClient({
  conceptProvider,
  unavailableReason,
}: {
  readonly conceptProvider: "openai" | "deterministic" | null;
  readonly unavailableReason: string | null;
}) {
  return (
    <main className="workspace-page create-design-page">
      <section className="workspace-title-block">
        <p className="eyebrow">One jump customizer</p>
        <h1>Customize a jump</h1>
        <p>
          Start with the same four-pole vertical jump, then choose how its wings
          should look. Colors, wing shape, preview, revision history, and course
          placement belong to one jump design.
        </p>
      </section>
      <section className="create-jump-foundation">
        <div>
          <span className="create-stage-label">01 / Jump foundation</span>
          <p className="eyebrow">Controlled vertical structure</p>
          <h2>One jump. Different wings.</h2>
          <p>
            Every path starts with four poles and the current prototype support
            system. Choosing custom wings changes the wing profile—not the
            evidence status of the structure.
          </p>
        </div>
        <dl>
          <div>
            <dt>Structure</dt>
            <dd>Four-pole vertical</dd>
          </div>
          <div>
            <dt>Preview</dt>
            <dd>Matching 2.5D and 3D</dd>
          </div>
          <div>
            <dt>Save model</dt>
            <dd>Exact immutable revision</dd>
          </div>
        </dl>
      </section>
      <section
        className="create-wing-design"
        aria-labelledby="wing-design-title"
      >
        <header>
          <span className="create-stage-label">02 / Wing design</span>
          <p className="eyebrow">Choose how to begin</p>
          <h2 id="wing-design-title">How should the wings look?</h2>
          <p>
            Standard panels go directly to appearance controls. Described and
            uploaded wings add a silhouette review before returning to the same
            complete-jump preview and save step.
          </p>
        </header>
        <div className="create-wing-options">
          <article>
            <span className="create-wing-option-number">A</span>
            <p className="eyebrow">Standard wing panels</p>
            <h3>Customize the existing jump</h3>
            <p>
              Choose frame color, lower element, and logo artwork on the known
              rectangular wing panels.
            </p>
            <Link href="/designs/local-spj-04/edit">Use standard wings</Link>
          </article>
          <article>
            <span className="create-wing-option-number">B</span>
            <p className="eyebrow">Custom silhouette</p>
            <h3>Describe the wings</h3>
            <p>
              Describe a subject, colors, and style. Select one concept, inspect
              its silhouette, then customize and save the complete jump.
            </p>
            {conceptProvider ? (
              <Link href="/designs/local-spj-04/edit?wing=description">
                Describe custom wings
                {conceptProvider === "deterministic"
                  ? " · Workflow simulator"
                  : ""}
              </Link>
            ) : (
              <p>
                Concept generation is not configured in this local environment.
                <small>{unavailableReason}</small>
              </p>
            )}
          </article>
          <article>
            <span className="create-wing-option-number">C</span>
            <p className="eyebrow">Custom silhouette</p>
            <h3>Upload an image</h3>
            <p>
              Use one owned PNG or JPEG. Remove the background only after the
              explicit permission checks, then inspect the inferred profile.
            </p>
            <Link href="/designs/local-spj-04/edit?wing=image">
              Upload a wing image
            </Link>
          </article>
        </div>
      </section>
      <section className="create-jump-finish">
        <span className="create-stage-label">03 / Complete jump</span>
        <div>
          <h2>Customize, preview, save, then place.</h2>
          <p>
            A custom silhouette is not a separate product. Once approved, it
            becomes the wing design inside one complete jump revision that can
            be added to your course.
          </p>
        </div>
      </section>
      <PrototypeBoundary variant="concept" />
    </main>
  );
}
