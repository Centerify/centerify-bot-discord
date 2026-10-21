import {
  MessageFlags,
  MessageFlagsBitField,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type InteractionDeferReplyOptions,
  type InteractionReplyOptions,
  type RepliableInteraction,
} from "discord.js";

type CommandInteraction = RepliableInteraction | ContextMenuCommandInteraction;

/** Acknowledge before permission checks, Discord requests, or database work. */
export async function deferCommandReply(
  interaction: CommandInteraction,
  options: InteractionDeferReplyOptions = {},
) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply(options);
}

/** Keep public command results public and permission errors private. */
export async function replyToCommand(
  interaction: CommandInteraction,
  options: string | InteractionReplyOptions,
) {
  if (!interaction.deferred && !interaction.replied) return interaction.reply(options);
  if (interaction.replied) return interaction.followUp(options);
  const payload = typeof options === "string" ? { content: options } : options;
  const flags = new MessageFlagsBitField(
    payload.flags as ConstructorParameters<typeof MessageFlagsBitField>[0],
  );
  if (flags.has(MessageFlags.Ephemeral) && interaction.ephemeral === false) {
    // Visibility cannot be changed by editing a deferred response.
    const response = await interaction.followUp(payload);
    await interaction.deleteReply();
    return response;
  }
  const {
    flags: _flags,
    fetchReply: _fetch,
    withResponse: _response,
    ephemeral: _ephemeral,
    ...edit
  } = payload;
  const editFlags = flags.remove(MessageFlags.Ephemeral).bitfield;
  return interaction.editReply({ ...edit, ...(editFlags ? { flags: editFlags } : {}) });
}

export function commandReplyOptions(
  interaction: ChatInputCommandInteraction,
): InteractionDeferReplyOptions {
  const publicReply =
    ["ping", "help", "info", "server", "status"].includes(interaction.commandName) ||
    (interaction.commandName === "xp" && interaction.options.getSubcommand() !== "daily");
  return publicReply ? {} : { flags: MessageFlags.Ephemeral };
}

/** API errors contain callback tokens in their URL and request body. */
export function interactionErrorDetails(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return {
    code,
    errorType: error instanceof Error ? error.name : "Unknown",
    errorMessage:
      error instanceof Error
        ? error.message.replace(/https?:\/\/\S+/g, "[redacted URL]").slice(0, 500)
        : undefined,
  };
}

export function interactionUnavailable(error: unknown) {
  const { code } = interactionErrorDetails(error);
  return code === 10062 || code === 40060;
}
