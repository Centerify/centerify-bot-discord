import { Command } from "@sapphire/framework";
import { ChannelType, InteractionContextType, PermissionFlagsBits as P } from "discord.js";
import { ManagementError, requireChannelAccess, runManagement } from "../guards.js";

const channelTypes = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
] as const;

export class ChannelCommand extends Command {
  override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName("channel")
        .setDescription("Create and manage server channels")
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(P.ManageChannels)
        .addSubcommand((sub) =>
          sub
            .setName("create")
            .setDescription("Create a text, voice or category channel")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Channel name")
                .setMinLength(1)
                .setMaxLength(100)
                .setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName("type")
                .setDescription("Channel type")
                .setChoices(
                  { name: "Text", value: ChannelType.GuildText },
                  { name: "Voice", value: ChannelType.GuildVoice },
                  { name: "Category", value: ChannelType.GuildCategory },
                )
                .setRequired(true),
            )
            .addChannelOption((o) =>
              o
                .setName("category")
                .setDescription("Parent category")
                .addChannelTypes(ChannelType.GuildCategory),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("edit")
            .setDescription("Change a channel name, topic or category")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel to edit")
                .addChannelTypes(...channelTypes)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("name").setDescription("New name").setMinLength(1).setMaxLength(100),
            )
            .addStringOption((o) =>
              o.setName("topic").setDescription("New text channel topic").setMaxLength(1024),
            )
            .addChannelOption((o) =>
              o
                .setName("category")
                .setDescription("New parent category")
                .addChannelTypes(ChannelType.GuildCategory),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("slowmode")
            .setDescription("Set text channel slowmode; zero disables it")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Text channel")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName("seconds")
                .setDescription("Delay in seconds")
                .setMinValue(0)
                .setMaxValue(21600)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("delete")
            .setDescription("Permanently delete a channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel to delete")
                .addChannelTypes(...channelTypes)
                .setRequired(true),
            )
            .addBooleanOption((o) =>
              o
                .setName("confirm")
                .setDescription("Set true to confirm permanent deletion")
                .setRequired(true),
            ),
        ),
    );
  }

  override async chatInputRun(input: Command.ChatInputCommandInteraction) {
    await runManagement(input, P.ManageChannels, async (context) => {
      const { interaction, guild, reason } = context;
      const sub = interaction.options.getSubcommand();
      const categoryId = interaction.options.getChannel("category")?.id;
      if (categoryId) {
        const category = await guild.channels.fetch(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory)
          throw new ManagementError("Choose an existing category in this server.");
        requireChannelAccess(context, category, [P.ViewChannel, P.ManageChannels]);
      }
      if (sub === "create") {
        const type = interaction.options.getInteger("type", true);
        if (
          ![ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory].includes(type)
        )
          throw new ManagementError("Unsupported channel type.");
        if (type === ChannelType.GuildCategory && categoryId)
          throw new ManagementError("A category cannot have a parent category.");
        const name = interaction.options.getString("name", true).trim();
        if (!name) throw new ManagementError("Enter a channel name.");
        const channel = await guild.channels.create({
          name,
          type: type as ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildCategory,
          parent: categoryId,
          reason,
        });
        return `Created <#${channel.id}>.`;
      }
      const channel = await guild.channels.fetch(
        interaction.options.getChannel("channel", true).id,
      );
      if (!channel || channel.isThread())
        throw new ManagementError("Choose an existing server channel.");
      requireChannelAccess(context, channel, [P.ViewChannel, P.ManageChannels]);
      if (
        "topic" in channel &&
        (channel.topic?.startsWith("centerify-ticket:") ||
          channel.topic?.startsWith("better-ticket:"))
      )
        throw new ManagementError(
          "Use /ticket to manage ticket channels and preserve their records.",
        );
      if (sub === "delete") {
        if (interaction.options.getBoolean("confirm", true) !== true)
          throw new ManagementError(
            "Deletion cancelled. Set confirm to true to delete the channel permanently.",
          );
        if (channel.id === interaction.channelId)
          throw new ManagementError(
            "Run this command from another channel so I can report the result.",
          );
        await channel.delete(reason);
        return `Deleted channel ${channel.id}.`;
      }
      if (sub === "slowmode") {
        if (channel.type !== ChannelType.GuildText)
          throw new ManagementError("Choose a text channel for slowmode.");
        const seconds = interaction.options.getInteger("seconds", true);
        await channel.setRateLimitPerUser(seconds, reason);
        return `Slowmode set to ${seconds} seconds in <#${channel.id}>.`;
      }
      const name = interaction.options.getString("name")?.trim();
      const topic = interaction.options.getString("topic");
      if (name === "") throw new ManagementError("Enter a channel name.");
      if (!name && topic === null && !categoryId)
        throw new ManagementError("Choose a name, topic or category to change.");
      if (channel.type === ChannelType.GuildCategory && categoryId)
        throw new ManagementError("A category cannot have a parent category.");
      if (
        topic !== null &&
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      )
        throw new ManagementError("Topics are supported only for text and announcement channels.");
      if (topic?.startsWith("centerify-ticket:"))
        throw new ManagementError("That topic prefix is reserved for ticket records.");
      await channel.edit({
        ...(name ? { name } : {}),
        ...(topic !== null ? { topic } : {}),
        ...(categoryId ? { parent: categoryId, lockPermissions: false } : {}),
        reason,
      });
      return `Updated <#${channel.id}>.`;
    });
  }
}
