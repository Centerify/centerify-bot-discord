export function ticketCommand(sdk, runtime) {
    const { Command, discord: { ChannelType, InteractionContextType }, } = sdk;
    return class BetterTicketCommand extends Command {
        registerApplicationCommands(registry) {
            registry.registerChatInputCommand((builder) => {
                builder
                    .setName("bticket")
                    .setDescription("Better Ticket support management")
                    .setContexts(InteractionContextType.Guild);
                const profileOption = (o) => o
                    .setName("profile")
                    .setDescription("Department key, such as support or billing")
                    .setMaxLength(24)
                    .setRequired(true);
                builder.addSubcommand((sub) => sub
                    .setName("setup")
                    .setDescription("Manager: create or update a support department")
                    .addStringOption(profileOption)
                    .addChannelOption((o) => o
                    .setName("category")
                    .setDescription("Category for new tickets")
                    .addChannelTypes(ChannelType.GuildCategory)
                    .setRequired(true))
                    .addRoleOption((o) => o.setName("support_role").setDescription("Support staff role").setRequired(true))
                    .addChannelOption((o) => o
                    .setName("transcripts")
                    .setDescription("Private transcript and audit channel")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true))
                    .addChannelOption((o) => o
                    .setName("archive")
                    .setDescription("Optional category for closed tickets")
                    .addChannelTypes(ChannelType.GuildCategory))
                    .addStringOption((o) => o.setName("title").setDescription("Department title").setMaxLength(80))
                    .addStringOption((o) => o
                    .setName("welcome")
                    .setDescription("Welcome message inside new tickets")
                    .setMaxLength(1000)));
                builder.addSubcommand((sub) => sub
                    .setName("configure")
                    .setDescription("Manager: change limits, access and automation")
                    .addStringOption(profileOption)
                    .addBooleanOption((o) => o.setName("enabled").setDescription("Allow new tickets"))
                    .addIntegerOption((o) => o
                    .setName("open_limit")
                    .setDescription("Active tickets per member across departments")
                    .setMinValue(1)
                    .setMaxValue(5))
                    .addIntegerOption((o) => o
                    .setName("cooldown")
                    .setDescription("Seconds between ticket creations")
                    .setMinValue(0)
                    .setMaxValue(86400))
                    .addIntegerOption((o) => o
                    .setName("inactivity_minutes")
                    .setDescription("Close inactive tickets; 0 disables")
                    .setMinValue(0)
                    .setMaxValue(43200))
                    .addRoleOption((o) => o.setName("required_role").setDescription("Require this role to open a ticket"))
                    .addBooleanOption((o) => o
                    .setName("clear_required_role")
                    .setDescription("Remove the opening role requirement"))
                    .addBooleanOption((o) => o.setName("staff_close_only").setDescription("Only staff can close tickets")));
                builder.addSubcommand((sub) => sub
                    .setName("form")
                    .setDescription("Manager: set up to five intake questions")
                    .addStringOption(profileOption)
                    .addStringOption((o) => o
                    .setName("questions")
                    .setDescription("One question per line; prefix optional questions with ?; use none to disable")
                    .setMaxLength(250)
                    .setRequired(true)));
                builder.addSubcommand((sub) => sub
                    .setName("profiles")
                    .setDescription("Manager: list support departments or remove one")
                    .addStringOption((o) => o
                    .setName("remove")
                    .setDescription("Department key to remove; ticket history is retained")
                    .setMaxLength(24))
                    .addBooleanOption((o) => o.setName("confirm").setDescription("Confirm department removal")));
                builder.addSubcommand((sub) => sub
                    .setName("panel")
                    .setDescription("Manager: publish a department menu or ticket button")
                    .addChannelOption((o) => o
                    .setName("channel")
                    .setDescription("Panel channel")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true))
                    .addStringOption((o) => o
                    .setName("profile")
                    .setDescription("Single department; omit for a department menu")
                    .setMaxLength(24))
                    .addStringOption((o) => o.setName("message").setDescription("Panel message").setMaxLength(1800)));
                builder.addSubcommand((sub) => sub
                    .setName("open")
                    .setDescription("Open a support ticket")
                    .addStringOption((o) => o
                    .setName("profile")
                    .setDescription("Department key")
                    .setMaxLength(24)
                    .setRequired(true)));
                builder.addSubcommand((sub) => sub
                    .setName("claim")
                    .setDescription("Staff: claim or assign this ticket")
                    .addUserOption((o) => o.setName("member").setDescription("Manager: assign another support staff member")));
                builder.addSubcommand((sub) => sub.setName("unclaim").setDescription("Staff: release your ticket claim"));
                builder.addSubcommand((sub) => sub
                    .setName("priority")
                    .setDescription("Staff: set ticket priority")
                    .addStringOption((o) => o
                    .setName("level")
                    .setDescription("Priority")
                    .setChoices(...["low", "normal", "high", "urgent"].map((value) => ({ name: value, value })))
                    .setRequired(true)));
                builder.addSubcommand((sub) => sub
                    .setName("rename")
                    .setDescription("Staff: rename this ticket channel")
                    .addStringOption((o) => o
                    .setName("name")
                    .setDescription("New channel name")
                    .setMinLength(1)
                    .setMaxLength(80)
                    .setRequired(true)));
                builder.addSubcommand((sub) => sub
                    .setName("close")
                    .setDescription("Close this ticket and automatically save its transcript")
                    .addStringOption((o) => o.setName("reason").setDescription("Resolution or close reason").setMaxLength(1000)));
                builder.addSubcommand((sub) => sub.setName("reopen").setDescription("Staff: reopen this closed ticket"));
                for (const action of ["add", "remove"])
                    builder.addSubcommand((sub) => sub
                        .setName(action)
                        .setDescription(`Staff: ${action} a ticket participant`)
                        .addUserOption((o) => o.setName("member").setDescription("Server member").setRequired(true)));
                builder.addSubcommand((sub) => sub
                    .setName("note")
                    .setDescription("Staff: read or add private staff notes")
                    .addStringOption((o) => o
                    .setName("text")
                    .setDescription("Note text; omit to read saved notes")
                    .setMaxLength(1000)));
                builder.addSubcommand((sub) => sub
                    .setName("transcript")
                    .setDescription("Save and download this ticket's HTML transcript"));
                builder.addSubcommand((sub) => sub
                    .setName("delete")
                    .setDescription("Staff: archive and permanently delete a closed channel")
                    .addBooleanOption((o) => o
                    .setName("confirm")
                    .setDescription("Confirm channel deletion; archive and metadata are retained")
                    .setRequired(true)));
                builder.addSubcommand((sub) => sub
                    .setName("rate")
                    .setDescription("Ticket creator: rate a closed ticket once")
                    .addIntegerOption((o) => o
                    .setName("stars")
                    .setDescription("Rating out of five")
                    .setMinValue(1)
                    .setMaxValue(5)
                    .setRequired(true))
                    .addStringOption((o) => o.setName("comment").setDescription("Optional feedback").setMaxLength(500)));
                builder.addSubcommand((sub) => sub
                    .setName("queue")
                    .setDescription("Staff: view the support queue")
                    .addStringOption((o) => o
                    .setName("status")
                    .setDescription("Ticket state")
                    .setChoices({ name: "Open", value: "OPEN" }, { name: "Closed", value: "CLOSED" }, { name: "All", value: "all" }))
                    .addIntegerOption((o) => o.setName("page").setDescription("Page number").setMinValue(1).setMaxValue(100)));
                builder.addSubcommand((sub) => sub.setName("stats").setDescription("Staff: ticket volume, response times and ratings"));
                builder.addSubcommand((sub) => sub
                    .setName("block")
                    .setDescription("Manager: block or unblock ticket creation")
                    .addUserOption((o) => o.setName("member").setDescription("Server member").setRequired(true))
                    .addBooleanOption((o) => o.setName("blocked").setDescription("True blocks; false unblocks").setRequired(true)));
                builder.addSubcommand((sub) => sub
                    .setName("reply")
                    .setDescription("Staff: send a saved reply; managers can save replies")
                    .addStringOption((o) => o
                    .setName("name")
                    .setDescription("Saved reply key")
                    .setMaxLength(24)
                    .setRequired(true))
                    .addStringOption((o) => o
                    .setName("text")
                    .setDescription("Manager: save or replace this reply")
                    .setMaxLength(1800)));
                builder.addSubcommand((sub) => sub.setName("info").setDescription("View this ticket's status and history"));
                return builder;
            });
        }
        async chatInputRun(interaction) {
            await runtime.command(interaction);
        }
    };
}
