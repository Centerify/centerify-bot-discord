import { serviceToken, type CenterifyModule } from "../../core/index.js";
import { PlanGreeting } from "./application/PlanGreeting.js";
export { PlanGreeting } from "./application/PlanGreeting.js";
export type { GreetingConfig } from "./application/PlanGreeting.js";
export const greetingPlanToken = serviceToken<Pick<PlanGreeting, keyof PlanGreeting>>("welcome.plan");
export function createWelcomeModule(options: { planner?: PlanGreeting } = {}): CenterifyModule {
  return {
    metadata: { id: "welcome", name: "Welcome and goodbye", version: "1.0.0", dependsOn: ["guilds"] },
    register(context) { context.provide(greetingPlanToken, options.planner ?? new PlanGreeting()); },
  };
}
