import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type MessageCreateOptions,
} from "discord.js";
import type { EmbedTemplate, ResponseTemplate } from "../domain/types.js";
import type { CustomCommandExecutionContext } from "../discord/types.js";
import { CustomCommandValidator } from "../domain/CustomCommandValidator.js";
import {
  CustomCommandVariableResolver,
  type TemplateRender,
} from "./CustomCommandVariableResolver.js";
import { renderComponentAction } from "./actionTemplates.js";

export interface CustomCommandResponseHandler {
  type: string;
  render(
    template: ResponseTemplate,
    context: CustomCommandExecutionContext,
    render: TemplateRender,
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
      render: async (template, context, render) => {
        if (template.type !== "TEXT")
          throw new Error("Unexpected response strategy.");
        const content = await this.interpolate(template.text, render);
        this.validator.responses([{ type: "TEXT", text: content }], false);
        return { content };
      },
    });
    this.register({
      type: "EMBED",
      render: async (template, context, render) => {
        if (template.type !== "EMBED")
          throw new Error("Unexpected response strategy.");
        const embed: EmbedTemplate = structuredClone(template.embed);
        if (embed.title)
          embed.title = await this.interpolate(embed.title, render);
        if (embed.description)
          embed.description = await this.interpolate(embed.description, render);
        if (embed.author)
          embed.author.name = await this.interpolate(embed.author.name, render);
        if (embed.footer)
          embed.footer.text = await this.interpolate(embed.footer.text, render);
        if (embed.fields)
          for (const field of embed.fields) {
            field.name = await this.interpolate(field.name, render);
            field.value = await this.interpolate(field.value, render);
          }
        // Resolve approved complete URL placeholders; missing optional images are omitted.
        const resolveUrl = render;
        if (embed.url) {
          embed.url = await resolveUrl(embed.url);
          if (!embed.url) delete embed.url;
        }
        for (const key of ["image", "thumbnail"] as const) {
          if (embed[key]) {
            const url = await resolveUrl(embed[key]!.url);
            if (url) embed[key] = { url };
            else delete embed[key];
          }
        }
        for (const item of [embed.author, embed.footer]) {
          if (item?.icon_url) {
            item.icon_url = await resolveUrl(item.icon_url);
            if (!item.icon_url) delete item.icon_url;
          }
        }
        if (embed.author?.url) {
          embed.author.url = await resolveUrl(embed.author.url);
          if (!embed.author.url) delete embed.author.url;
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
    render: TemplateRender,
  ): Promise<string> {
    return (await render(template)).replace(/@(everyone|here)/gi, "@\u200b$1");
  }
  public async render(
    context: CustomCommandExecutionContext,
    allStages = false,
  ): Promise<MessageCreateOptions[]> {
    // Render and check every message before sending the first one.
    const responses: MessageCreateOptions[] = [];
    const render = this.variables.createSession(context);
    for (const [responseIndex, template] of this.validator
      .responses(context.command.content)
      .entries()) {
      if (!allStages && template.stage !== undefined && template.stage !== 0)
        continue;
      const handler = this.handlers.get(template.type);
      if (!handler) throw new Error("Missing response handler.");
      const buttons = this.validator.buttons(
        await Promise.all(
          (template.buttons ?? []).map(async (button) => ({
            ...button,
            ...("action" in button
              ? await renderComponentAction(
                  button,
                  context,
                  this.variables,
                  render,
                )
              : {}),
            label: await this.interpolate(button.label, render),
          })),
        ),
        false,
      );
      const selects = this.validator.selects(
        await Promise.all(
          (template.selects ?? []).map(async (select) => ({
            placeholder: await this.interpolate(select.placeholder, render),
            options: await Promise.all(
              select.options.map(async (option) => ({
                ...option,
                ...(await renderComponentAction(
                  option,
                  context,
                  this.variables,
                  render,
                )),
                label: await this.interpolate(option.label, render),
                ...(option.description === undefined
                  ? {}
                  : {
                      description: await this.interpolate(
                        option.description,
                        render,
                      ),
                    }),
              })),
            ),
          })),
        ),
        false,
      );
      responses.push({
        ...(await handler.render(template, context, render)),
        ...(buttons.length || selects.length
          ? {
              components: [
                ...(buttons.length
                  ? [
                      new ActionRowBuilder<ButtonBuilder>().addComponents(
                        buttons.map((button, index) => {
                          const builder = new ButtonBuilder().setLabel(
                            button.label,
                          );
                          if ("url" in button)
                            return builder
                              .setStyle(ButtonStyle.Link)
                              .setURL(button.url);
                          const styles = {
                            primary: ButtonStyle.Primary,
                            secondary: ButtonStyle.Secondary,
                            success: ButtonStyle.Success,
                            danger: ButtonStyle.Danger,
                          };
                          return builder
                            .setStyle(styles[button.style ?? "primary"])
                            .setCustomId(
                              template.stage === undefined
                                ? `cc-response:${responseIndex}:${index}`
                                : `cc-stage:${template.stage}:${index}`,
                            );
                        }),
                      ),
                    ]
                  : []),
                ...selects.map((select, index) =>
                  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                      .setCustomId(
                        `cc-select:${template.stage ?? responseIndex}:${index}`,
                      )
                      .setPlaceholder(select.placeholder)
                      .setMinValues(1)
                      .setMaxValues(1)
                      .addOptions(
                        select.options.map((option, optionIndex) => ({
                          label: option.label,
                          value: String(optionIndex),
                          ...(option.description === undefined
                            ? {}
                            : { description: option.description }),
                        })),
                      ),
                  ),
                ),
              ],
            }
          : {}),
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
