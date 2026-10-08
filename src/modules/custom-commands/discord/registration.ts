import { ChannelType } from "discord.js";
import type {
  SlashCommandSubcommandBuilder,
  SlashCommandBuilder,
} from "discord.js";
import {
  CUSTOM_COMMAND_LIMITS as L,
  COOLDOWN_SCOPES,
  RESPONSE_TYPES,
  TRIGGER_TYPES,
} from "../domain/constants.js";
export function definitionOptions(
  sub: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return sub
    .addStringOption((o) =>
      o
        .setName("description")
        .setDescription("Short description")
        .setMaxLength(L.description),
    )
    .addStringOption((o) =>
      o
        .setName("aliases")
        .setDescription("Aliases separated by spaces; use 'none' to clear")
        .setMaxLength(L.aliases * (L.name + 1)),
    )
    .addStringOption((o) =>
      o
        .setName("response_type")
        .setDescription(
          "Embed starts with a description; configure adds fields/messages",
        )
        .addChoices(...RESPONSE_TYPES.map((value) => ({ name: value, value }))),
    )
    .addStringOption((o) =>
      o
        .setName("trigger_type")
        .setDescription("Allowed execution sources")
        .addChoices(...TRIGGER_TYPES.map((value) => ({ name: value, value }))),
    )
    .addStringOption((o) =>
      o
        .setName("cooldown_scope")
        .setDescription("Cooldown scope")
        .addChoices(
          ...COOLDOWN_SCOPES.map((value) => ({ name: value, value })),
        ),
    )
    .addRoleOption((o) =>
      o
        .setName("denied_role")
        .setDescription("Deny this role; configure supports multiple roles"),
    )
    .addChannelOption((o) =>
      o
        .setName("denied_channel")
        .setDescription(
          "Deny this channel; configure supports multiple channels",
        ),
    )
    .addStringOption((o) =>
      o
        .setName("user_permissions")
        .setDescription(
          "Discord permission names separated by spaces, e.g. ManageMessages",
        )
        .setMaxLength(L.restrictions * (L.name + 1)),
    )
    .addStringOption((o) =>
      o
        .setName("bot_permissions")
        .setDescription(
          "Additional required bot permission names separated by spaces",
        )
        .setMaxLength(L.restrictions * (L.name + 1)),
    )
    .addBooleanOption((o) =>
      o
        .setName("delete_invocation")
        .setDescription(
          "Delete prefix invocation after delivery (requires Manage Messages)",
        ),
    )
    .addBooleanOption((o) =>
      o.setName("reply").setDescription("Reply to the invocation"),
    )
    .addBooleanOption((o) =>
      o.setName("active").setDescription("Whether the command is enabled"),
    );
}
export function extraSubcommands(builder: SlashCommandBuilder): void {
  for (const name of ["template", "markdown"]) builder.addSubcommand((sub) =>
    sub
      .setName(name)
      .setDescription(name === "template" ? "Save command responses from a template file" : "Alias for /custom template")
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Existing command name")
          .setRequired(true)
          .setMaxLength(L.name),
      )
      .addAttachmentOption((o) =>
        o
          .setName("file")
          .setDescription("Command template (.txt; legacy .md also works)")
          .setRequired(true),
      ),
  );
  builder.addSubcommand((sub) =>
    sub
      .setName("options")
      .setDescription(
        "Configure custom commands and share them between servers",
      ),
  );
  for (const name of ["info", "disable", "configure"] as const)
    builder.addSubcommand((sub) =>
      sub
        .setName(name)
        .setDescription(
          `${name === "configure" ? "Open the template editor for" : name === "info" ? "Show details of" : "Disable"} a custom command`,
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("Command name").setRequired(true),
        ),
    );
  for (const name of ["clone", "rename"] as const)
    builder.addSubcommand((sub) =>
      sub
        .setName(name)
        .setDescription(
          `${name === "clone" ? "Copy" : "Rename"} a custom command`,
        )
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("Existing command name")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("new_name")
            .setDescription("New command name")
            .setRequired(true)
            .setMaxLength(L.name),
        ),
    );
  builder.addSubcommand((sub) =>
    sub
      .setName("run")
      .setDescription("Run a server custom command")
      .addStringOption((o) =>
        o
          .setName("command")
          .setDescription("Command name or alias")
          .setRequired(true)
          .setMaxLength(L.name),
      )
      .addStringOption((o) =>
        o
          .setName("args")
          .setDescription("Arguments separated by spaces")
          .setMaxLength(L.text),
      ),
  );
  builder.addSubcommand((sub) =>
    sub
      .setName("import")
      .setDescription("Import validated version 1 commands atomically")
      .addAttachmentOption((o) =>
        o
          .setName("file")
          .setDescription("JSON export file, at most 8 MB")
          .setRequired(true),
      ),
  );
  builder.addSubcommand((sub) =>
    sub
      .setName("export")
      .setDescription("Download this server's commands as JSON"),
  );
}

export function createOptions(
  sub: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return definitionOptions(
    sub
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Unique command name")
          .setRequired(true)
          .setMaxLength(L.name),
      )
      .addStringOption((o) =>
        o
          .setName("response")
          .setDescription(
            "Response; supports {user.mention}, {guild.name}, {args.0}",
          )
          .setRequired(true)
          .setMaxLength(L.text),
      )
      .addStringOption((o) =>
        o
          .setName("kind")
          .setDescription(
            "Optional: use the legacy command or member-event format",
          )
          .addChoices(
            { name: "Legacy message command", value: "command" },
            { name: "Member joins", value: "member_join" },
            { name: "Member leaves", value: "member_leave" },
          ),
      )
      .addStringOption((o) =>
        o
          .setName("trigger")
          .setDescription("Alternative command word after !")
          .setMaxLength(L.name),
      )
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("Allowed channel; output channel for legacy events")
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
          ),
      )
      .addRoleOption((o) =>
        o
          .setName("role")
          .setDescription("Only members with this role can run the command"),
      )
      .addBooleanOption((o) =>
        o
          .setName("admin_only")
          .setDescription("Require Administrator permission"),
      )
      .addBooleanOption((o) =>
        o.setName("allow_args").setDescription("Legacy only: allow arguments"),
      )
      .addIntegerOption((o) =>
        o
          .setName("cooldown")
          .setDescription("Seconds between uses (0–86400)")
          .setMinValue(0)
          .setMaxValue(L.cooldownSeconds),
      )
      .addBooleanOption((o) =>
        o.setName("embed").setDescription("Send an embed description"),
      ),
  );
}
export function editOptions(
  sub: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return definitionOptions(
    sub
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Command name")
          .setRequired(true)
          .setMaxLength(L.name),
      )
      .addStringOption((o) =>
        o
          .setName("response")
          .setDescription("Replace response text / embed description")
          .setMaxLength(L.text),
      )
      .addIntegerOption((o) =>
        o
          .setName("cooldown")
          .setDescription("Seconds between uses")
          .setMinValue(0)
          .setMaxValue(L.cooldownSeconds),
      )
      .addRoleOption((o) => o.setName("role").setDescription("Allowed role"))
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Allowed channel"),
      )
      .addBooleanOption((o) =>
        o.setName("embed").setDescription("Use an embed description"),
      )
      .addBooleanOption((o) =>
        o
          .setName("admin_only")
          .setDescription("Require Administrator permission"),
      ),
  );
}
