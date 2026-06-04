import { courseExceedsCredit, state } from "./state.js";
import { applyStoredLayout, bindSplitters, constrainLayoutVars } from "../shared/layout.js";
import { showError } from "../shared/error.js";
import { createActivityFeature } from "../features/activity/activity.js";
import { createTimetableFeature } from "../features/timetable/timetable.js";
import { createAcademicFeature } from "../features/academic/academic.js";
import { createLogsFeature } from "../features/logs/logs.js";
import { createGrabFeature } from "../features/grab/grab.js";
import { createAuthFeature } from "../features/auth/auth.js";
import { createTreeFeature } from "../features/tree/tree.js";

export function createApp() {
  const app = {
    state,
    showError,
    stateHelpers: { courseExceedsCredit },
  };
  const getApp = () => app;

  app.activity = createActivityFeature({ state, getApp });
  app.timetable = createTimetableFeature({ state, getApp });
  app.academic = createAcademicFeature({ state });
  app.logs = createLogsFeature({ state });
  app.grab = createGrabFeature({ state, getApp });
  app.auth = createAuthFeature({ state, getApp });
  app.tree = createTreeFeature({ state, getApp, helpers: app.stateHelpers });

  app.start = async () => {
    applyStoredLayout();
    bindSplitters();
    app.grab.initGrabMonaco();
    app.tree.setFilterStatus();
    app.activity.renderActivities();
    if (!state.bootstrap) await app.auth.loadBootstrap();
    app.auth.updateAuthStatus();
    constrainLayoutVars();
    app.logs.connectLogStream();
    app.grab.pollGrabTasks();
  };

  return app;
}
