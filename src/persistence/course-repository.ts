import type { CourseDraft } from "@/domain/course";

import type { PersistenceResult } from "./result";

export const STARTER_COURSE_ROUTE_KEY = "local-course-1" as const;

export interface CourseRecord {
  readonly routeKey: typeof STARTER_COURSE_ROUTE_KEY;
  readonly name: "Local Course 01";
  readonly draft: CourseDraft;
  readonly lockVersion: number;
  readonly updatedAt: string;
}

export interface SaveCourseInput {
  readonly routeKey: typeof STARTER_COURSE_ROUTE_KEY;
  readonly expectedLockVersion: number;
  readonly draft: CourseDraft;
}

export interface CourseRepository {
  loadCourse(
    routeKey: typeof STARTER_COURSE_ROUTE_KEY,
  ): Promise<PersistenceResult<CourseRecord>>;
  saveCourse(
    input: SaveCourseInput,
  ): Promise<PersistenceResult<CourseRecord, CourseRecord>>;
}
