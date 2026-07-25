"use client";

import { useEffect, useState } from "react";

import type {
  CourseRecord,
  DesignRecord,
  DesignRevisionPage,
} from "@/persistence";
import { persistenceApi } from "@/lib/browser/persistence-api";

export function useServerWorkspaceCore(enabled = true) {
  const [state, setState] = useState<{
    readonly hydrated: boolean;
    readonly design: DesignRecord | null;
    readonly revisions: DesignRevisionPage["revisions"];
    readonly course: CourseRecord | null;
    readonly error: string | null;
  }>({
    hydrated: false,
    design: null,
    revisions: [],
    course: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.all([
      persistenceApi<DesignRecord>("/api/designs/local-spj-04"),
      persistenceApi<DesignRevisionPage>(
        "/api/designs/local-spj-04/revisions?limit=100",
      ),
      persistenceApi<CourseRecord>("/api/courses/local-course-1"),
    ]).then(([design, revisions, course]) => {
      if (cancelled) return;
      if (!design.ok || !revisions.ok || !course.ok) {
        const error = !design.ok
          ? design.error.message
          : !revisions.ok
            ? revisions.error.message
            : !course.ok
              ? course.error.message
              : "The server workspace is unavailable.";
        setState({
          hydrated: true,
          design: null,
          revisions: [],
          course: null,
          error,
        });
        return;
      }
      setState({
        hydrated: true,
        design: design.value,
        revisions: revisions.value.revisions,
        course: course.value,
        error: null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
