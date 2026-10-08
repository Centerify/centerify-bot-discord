export interface GreetingConfig {
  welcomeEnabled: boolean; welcomeChannelId: string | null; welcomeMessage: string;
  goodbyeEnabled: boolean; goodbyeChannelId: string | null; goodbyeMessage: string;
}
export class PlanGreeting {
  render(template: string, variables: ReadonlyMap<string, string>) {
    return template.replaceAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key: string) => variables.get(key) ?? match);
  }
  execute(kind: "welcome" | "goodbye", config: GreetingConfig, variables: ReadonlyMap<string, string>) {
    const enabled = kind === "welcome" ? config.welcomeEnabled : config.goodbyeEnabled;
    const channelId = kind === "welcome" ? config.welcomeChannelId : config.goodbyeChannelId;
    if (!enabled || !channelId) return null;
    return { channelId, content: this.render(kind === "welcome" ? config.welcomeMessage : config.goodbyeMessage, variables) };
  }
}
