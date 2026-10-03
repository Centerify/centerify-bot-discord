import { EmbedBuilder, type MessageCreateOptions } from "discord.js";
import type {
  CustomCommandExecutionContext,
  EmbedTemplate,
  ResponseTemplate,
} from "../../lib/customCommands/types.js";
import { CustomCommandValidator } from "./CustomCommandValidator.js";
import { CustomCommandVariableResolver } from "./CustomCommandVariableResolver.js";

export interface CustomCommandResponseHandler {
  type: string;
  render(
    template: ResponseTemplate,
    context: CustomCommandExecutionContext,
  ): Promise<MessageCreateOptions>;
}
export class CustomCommandRenderer {
  private readonly handlers = new Map<string, CustomCommandResponseHandler>();
  public constructor(
    private readonly variables = new CustomCommandVariableResolver(),
    private readonly validator = new CustomCommandValidator(variables),
  ) {
    this.register({
      type: "TEXT",
      render: async (template, context) => {
        if (template.type !== "TEXT")
          throw new Error("Unexpected response strategy.");
        const content = await this.interpolate(template.text, context);
        this.validator.responses([{ type: "TEXT", text: content }], false);
        return { content };
      },
    });
    this.register({
      type: "EMBED",
      render: async (template, context) => {
        if (template.type !== "EMBED")
          throw new Error("Unexpected response strategy.");
        const embed: EmbedTemplate = structuredClone(template.embed);
        if (embed.title)
          embed.title = await this.interpolate(embed.title, context);
        if (embed.description)
          embed.description = await this.interpolate(
            embed.description,
            context,
          );
        if (embed.author)
          embed.author.name = await this.interpolate(
            embed.author.name,
            context,
          );
        if (embed.footer)
          embed.footer.text = await this.interpolate(
            embed.footer.text,
            context,
          );
        if (embed.fields)
          for (const field of embed.fields) {
            field.name = await this.interpolate(field.name, context);
            field.value = await this.interpolate(field.value, context);
          }
        this.validator.embed(embed, false);
        const { timestamp, ...data } = embed;
        const builder = new EmbedBuilder(data);
        if (timestamp)
          builder.setTimestamp(
            timestamp === true ? new Date() : new Date(timestamp),
          );
        return { embeds: [builder] };
      },
    });
  }
  public register(handler: CustomCommandResponseHandler): void {
    if (this.handlers.has(handler.type))
      throw new Error("Duplicate response handler.");
    this.handlers.set(handler.type, handler);
  }
  private async interpolate(
    template: string,
    context: CustomCommandExecutionContext,
  ): Promise<string> {
    return (await this.variables.render(template, context)).replace(
      /@(everyone|here)/gi,
      "@\u200b$1",
    );
  }
  public async render(
    context: CustomCommandExecutionContext,
  ): Promise<MessageCreateOptions[]> {
    // Render and check every message before sending the first one.
    const responses: MessageCreateOptions[] = [];
    for (const template of this.validator.responses(context.command.content)) {
      const handler = this.handlers.get(template.type);
      if (!handler) throw new Error("Missing response handler.");
      responses.push({
        ...(await handler.render(template, context)),
        allowedMentions: {
          parse: [],
          users: [context.userId],
          roles: [],
          repliedUser: false,
        },
      });
    }
    return responses;
  }
}
