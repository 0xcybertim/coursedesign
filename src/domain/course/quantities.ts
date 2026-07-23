import type { LocalDesignRevision } from "../design/local-library";
import type { CourseDraft, CourseQuantitySummary } from "./types";

export function aggregateCourseQuantities(
  draft: CourseDraft,
  revisions: readonly LocalDesignRevision[],
): CourseQuantitySummary {
  const revisionById = new Map(
    revisions.map((revision) => [revision.revisionId, revision]),
  );
  const summary: CourseQuantitySummary = {
    obstacleInstances: 0,
    printedWingAssemblies: 0,
    poles: 0,
    cupsOrReleaseAdapters: 0,
    trackAssemblies: 0,
    footOrBallastAssemblies: 0,
    flags: 0,
    poleEndCaps: 0,
    lowerElements: { decorative_panel: 0, gate: 0, filler: 0 },
  };
  for (const instance of draft.instances) {
    const revision = revisionById.get(instance.obstacleDesignRevisionId);
    if (!revision) continue;
    summary.obstacleInstances += 1;
    for (const line of revision.snapshot.billOfMaterials.lines) {
      switch (line.componentKey) {
        case "printed_wing_assembly":
        case "silhouette_wing_plate":
          summary.printedWingAssemblies += line.quantity;
          break;
        case "aluminum_jump_pole":
        case "prototype_pole":
          summary.poles += line.quantity;
          break;
        case "cup_or_release_adapter":
          summary.cupsOrReleaseAdapters += line.quantity;
          break;
        case "keyhole_track_assembly":
        case "prototype_track":
          summary.trackAssemblies += line.quantity;
          break;
        case "foot_or_ballast_assembly":
          summary.footOrBallastAssemblies += line.quantity;
          break;
        case "flag":
          summary.flags += line.quantity;
          break;
        case "pole_end_cap":
          summary.poleEndCaps += line.quantity;
          break;
        case "lower_element":
          if (line.selection && line.selection !== "none") {
            summary.lowerElements[line.selection] += line.quantity;
          }
          break;
      }
    }
  }
  return summary;
}
