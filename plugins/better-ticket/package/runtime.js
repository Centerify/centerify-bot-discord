import { TicketStore, TicketError } from "./state.js";
import { collectTranscript } from "./transcript.js";
const reason = (by, text) => `Better Ticket: ${by} — ${text}`.slice(0, 512);
export class Runtime {
    sdk;
    store;
    busy = new Set();
    stopped = false;
    sweeping;
    constructor(sdk) {
        this.sdk = sdk;
        this.store = new TicketStore(sdk);
    }
    manager(ctx) {
        return (ctx.actor.id === ctx.guild.ownerId ||
            ctx.actor.permissions.has(this.sdk.discord.PermissionFlagsBits.ManageGuild));
    }
    staff(ctx, profile) {
        return (this.manager(ctx) ||
            ctx.actor.permissions.has(this.sdk.discord.PermissionFlagsBits.ManageChannels) ||
            profile.supportRoleIds.some((id) => ctx.actor.roles.cache.has(id)));
    }
    requireManager(ctx) {
        if (!this.manager(ctx))
            throw new TicketError("You need Manage Server permission to configure Better Ticket.");
    }
    requireStaff(ctx, ticket) {
        if (!this.staff(ctx, ticket.profile))
            throw new TicketError("Only this department's support staff can do that.");
    }
    async reply(ctx, content) {
        await ctx.input.editReply({ content, allowedMentions: { parse: [] } });
    }
    async execute(input, operation) {
        if (!input.deferred && !input.replied)
            await input.deferReply({ flags: this.sdk.discord.MessageFlags.Ephemeral });
        try {
            if (this.stopped)
                throw new TicketError("Better Ticket is stopping. Please try again after the restart.");
            if (!input.inCachedGuild())
                throw new TicketError("Use Better Ticket inside a server.");
            if (!(await this.sdk.authorize(input, "bticket")))
                return;
            const [actor, bot] = await Promise.all([
                input.guild.members.fetch({ user: input.user.id, force: true }),
                input.guild.members.fetchMe({ force: true }),
            ]);
            await operation({ input, guild: input.guild, actor, bot });
        }
        catch (error) {
            if (!(error instanceof TicketError) && !(error instanceof this.sdk.z.ZodError))
                this.sdk.logError(error, "Better Ticket action failed");
            await input.editReply({
                content: error instanceof TicketError
                    ? error.message
                    : error instanceof this.sdk.z.ZodError
                        ? "Invalid ticket settings. Check the field lengths, role IDs and department key."
                        : "That action could not finish. Check my permissions. Pending ticket operations are retried automatically after two minutes.",
                allowedMentions: { parse: [] },
            });
        }
    }
    get permissions() {
        const P = this.sdk.discord.PermissionFlagsBits;
        return [
            ...new Set([
                P.ManageChannels,
                P.ManageRoles,
                P.ViewChannel,
                P.ReadMessageHistory,
                P.SendMessages,
                P.AttachFiles,
                P.EmbedLinks,
                P.AddReactions,
                P.CreatePublicThreads,
                P.CreatePrivateThreads,
                P.SendMessagesInThreads,
            ]),
        ];
    }
    overwrites(ctx, ticket, closed = false) {
        const { PermissionFlagsBits: P, OverwriteType: T } = this.sdk.discord;
        const deny = [
            P.SendMessages,
            P.SendMessagesInThreads,
            P.CreatePublicThreads,
            P.CreatePrivateThreads,
            P.AddReactions,
        ];
        const access = [
            P.ViewChannel,
            P.ReadMessageHistory,
            ...(closed ? [] : [P.SendMessages, P.AttachFiles, P.EmbedLinks, P.AddReactions]),
        ];
        return [
            { id: ctx.guild.id, type: T.Role, deny: [P.ViewChannel, ...deny] },
            ...ticket.profile.supportRoleIds.map((id) => ({
                id,
                type: T.Role,
                allow: access,
                deny: closed ? deny : [P.CreatePublicThreads, P.CreatePrivateThreads],
            })),
            ...[ticket.ownerId, ...ticket.participants].map((id) => ({
                id,
                type: T.Member,
                allow: access,
                deny: closed ? deny : [P.CreatePublicThreads, P.CreatePrivateThreads],
            })),
            { id: ctx.bot.id, type: T.Member, allow: this.permissions },
        ];
    }
    controls(ticket) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = this.sdk.discord;
        const row = new ActionRowBuilder();
        const actions = ticket.status === "CLOSED"
            ? [
                ["reopen", "Reopen", ButtonStyle.Success],
                ["transcript", "Transcript", ButtonStyle.Secondary],
            ]
            : [
                ["claim", "Claim", ButtonStyle.Primary],
                ["close", "Close", ButtonStyle.Danger],
                ["transcript", "Transcript", ButtonStyle.Secondary],
            ];
        for (const [action, label, style] of actions)
            row.addComponents(new ButtonBuilder()
                .setCustomId(`bt:${action}:${ticket.number}`)
                .setLabel(label)
                .setStyle(style));
        return row;
    }
    async logChannel(guild, bot, profile) {
        const { ChannelType, PermissionFlagsBits: P } = this.sdk.discord;
        const channel = await guild.channels.fetch(profile.transcriptChannelId);
        if (!channel ||
            channel.type !== ChannelType.GuildText ||
            !channel
                .permissionsFor(bot)
                ?.has([P.ViewChannel, P.SendMessages, P.AttachFiles, P.EmbedLinks]))
            throw new TicketError("The private transcript channel is unavailable or I cannot upload files there.");
        if (channel.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel))
            throw new TicketError("The transcript channel must be hidden from everyone to protect private conversations.");
        return channel;
    }
    async validateProfile(ctx, profile) {
        const { ChannelType, PermissionFlagsBits: P } = this.sdk.discord;
        if (!ctx.bot.permissions.has(this.permissions))
            throw new TicketError("I need channel/role management, view/history, messages, attachments, embeds, reactions and thread permissions.");
        for (const id of [
            profile.categoryId,
            ...(profile.archiveCategoryId ? [profile.archiveCategoryId] : []),
        ]) {
            const category = await ctx.guild.channels.fetch(id);
            if (!category ||
                category.type !== ChannelType.GuildCategory ||
                !category.permissionsFor(ctx.bot)?.has(this.permissions) ||
                !category.permissionsFor(ctx.actor)?.has([P.ViewChannel, P.ManageChannels]))
                throw new TicketError("Choose categories that you and I can view and manage.");
        }
        for (const id of profile.supportRoleIds) {
            const role = await ctx.guild.roles.fetch(id);
            if (!role ||
                role.id === ctx.guild.id ||
                role.managed ||
                role.comparePositionTo(ctx.bot.roles.highest) >= 0 ||
                (ctx.actor.id !== ctx.guild.ownerId && role.comparePositionTo(ctx.actor.roles.highest) >= 0))
                throw new TicketError("Support roles must be dedicated roles below both your highest role and mine.");
        }
        if (profile.requiredRoleId && !(await ctx.guild.roles.fetch(profile.requiredRoleId)))
            throw new TicketError("The required opening role no longer exists.");
        const log = await this.logChannel(ctx.guild, ctx.bot, profile);
        if (!log.permissionsFor(ctx.actor)?.has(P.ViewChannel))
            throw new TicketError("You must be able to view the private transcript channel.");
    }
    async command(input) {
        await this.execute(input, async (ctx) => {
            const action = input.options.getSubcommand();
            if (["setup", "configure", "form", "profiles", "panel", "block"].includes(action)) {
                await this.configure(ctx, input, action);
                return;
            }
            if (action === "open") {
                const key = input.options.getString("profile", true);
                const profile = await this.store.profile(ctx.guild.id, key);
                if (!profile.enabled)
                    throw new TicketError("This department is disabled.");
                if (profile.questions.length) {
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = this.sdk.discord;
                    await input.editReply({
                        content: "Complete the intake form to open your ticket.",
                        components: [
                            new ActionRowBuilder().addComponents(new ButtonBuilder()
                                .setCustomId(`bt:open:${key}`)
                                .setLabel("Complete form")
                                .setStyle(ButtonStyle.Primary)),
                        ],
                        allowedMentions: { parse: [] },
                    });
                }
                else
                    await this.open(ctx, profile, {});
                return;
            }
            if (action === "queue" || action === "stats") {
                await this.overview(ctx, input, action);
                return;
            }
            if (action === "reply" && input.options.getString("text") !== null) {
                this.requireManager(ctx);
                const name = input.options.getString("name", true);
                const text = input.options.getString("text", true);
                await this.store.change(ctx.guild.id, (state) => {
                    if (!/^[a-z][a-z0-9-]{0,23}$/.test(name) || ["constructor", "prototype"].includes(name))
                        throw new TicketError("Use a simple lowercase reply key.");
                    if (!Object.hasOwn(state.replies, name) && Object.keys(state.replies).length >= 20)
                        throw new TicketError("Use at most 20 saved replies.");
                    state.replies[name] = text;
                });
                await this.reply(ctx, `Saved reply ${name}.`);
                return;
            }
            await this.action(ctx, {
                action,
                member: input.options.getUser("member")?.id,
                text: input.options.getString(action === "rename"
                    ? "name"
                    : action === "reply"
                        ? "name"
                        : action === "rate"
                            ? "comment"
                            : action === "close"
                                ? "reason"
                                : "text") ?? undefined,
                confirm: input.options.getBoolean("confirm") ?? undefined,
                priority: input.options.getString("level"),
                stars: input.options.getInteger("stars") ?? undefined,
            });
        });
    }
    async configure(ctx, input, action) {
        this.requireManager(ctx);
        const key = input.options.getString("profile") ?? "";
        if (action === "setup") {
            const old = await this.store.profile(ctx.guild.id, key).catch((error) => {
                if (error instanceof TicketError)
                    return null;
                throw error;
            });
            const profile = {
                ...old,
                key,
                title: input.options.getString("title") ?? old?.title ?? key,
                categoryId: input.options.getChannel("category", true).id,
                supportRoleIds: [input.options.getRole("support_role", true).id],
                transcriptChannelId: input.options.getChannel("transcripts", true).id,
                archiveCategoryId: input.options.getChannel("archive")?.id ?? old?.archiveCategoryId ?? null,
                welcome: input.options.getString("welcome") ?? old?.welcome ?? undefined,
            };
            const parsed = this.store.parseProfile(profile);
            await this.validateProfile(ctx, parsed);
            await this.store.saveProfile(ctx.guild.id, parsed);
            await this.reply(ctx, `Department ${key} saved. Publish it with /bticket panel.`);
            return;
        }
        if (action === "configure" || action === "form") {
            const profile = structuredClone(await this.store.profile(ctx.guild.id, key));
            if (action === "form") {
                const text = input.options.getString("questions", true).trim();
                profile.questions =
                    text.toLowerCase() === "none"
                        ? []
                        : text
                            .split(/\r?\n/)
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((label) => ({
                            required: !label.startsWith("?"),
                            label: label.replace(/^\?/u, "").trim(),
                        }));
                if (profile.questions.length > 5 ||
                    new Set(profile.questions.map((q) => q.label)).size !== profile.questions.length)
                    throw new TicketError("Use up to five different questions.");
            }
            else {
                for (const [option, property] of [
                    ["open_limit", "openLimit"],
                    ["cooldown", "cooldownSeconds"],
                    ["inactivity_minutes", "autoCloseMinutes"],
                ]) {
                    const value = input.options.getInteger(option);
                    if (value !== null)
                        profile[property] = value;
                }
                for (const [option, property] of [
                    ["enabled", "enabled"],
                    ["staff_close_only", "staffCloseOnly"],
                ]) {
                    const value = input.options.getBoolean(option);
                    if (value !== null)
                        profile[property] = value;
                }
                const role = input.options.getRole("required_role");
                if (role)
                    profile.requiredRoleId = role.id;
                if (input.options.getBoolean("clear_required_role"))
                    profile.requiredRoleId = null;
            }
            await this.validateProfile(ctx, profile);
            await this.store.saveProfile(ctx.guild.id, profile);
            await this.reply(ctx, `Updated ${key}. Existing tickets keep their saved department settings.`);
            return;
        }
        if (action === "profiles") {
            const remove = input.options.getString("remove");
            if (remove) {
                if (input.options.getBoolean("confirm") !== true)
                    throw new TicketError("Set confirm to true to remove this department. Existing tickets and history will remain.");
                await this.store.change(ctx.guild.id, (state) => {
                    if (!Object.hasOwn(state.profiles, remove))
                        throw new TicketError("Department not found.");
                    delete state.profiles[remove];
                });
                await this.reply(ctx, `Removed department ${remove}.`);
                return;
            }
            const state = await this.store.read(ctx.guild.id);
            await this.reply(ctx, Object.values(state.profiles)
                .map((profile) => `**${profile.key}** · ${profile.title} · ${profile.enabled ? "enabled" : "disabled"} · limit ${profile.openLimit} · idle ${profile.autoCloseMinutes} minutes`)
                .join("\n") || "No departments configured. Use /bticket setup.");
            return;
        }
        if (action === "block") {
            const user = input.options.getUser("member", true).id;
            const blocked = input.options.getBoolean("blocked", true);
            if (user === ctx.guild.ownerId || user === ctx.bot.id)
                throw new TicketError("The server owner and bot cannot be blocked.");
            await this.store.change(ctx.guild.id, (state) => {
                state.blockedUserIds = state.blockedUserIds.filter((id) => id !== user);
                if (blocked)
                    state.blockedUserIds.push(user);
            });
            await this.reply(ctx, `${blocked ? "Blocked" : "Unblocked"} <@${user}> for new tickets.`);
            return;
        }
        const state = await this.store.read(ctx.guild.id);
        const profiles = Object.values(state.profiles).filter((profile) => profile.enabled && (!key || profile.key === key));
        if (!profiles.length)
            throw new TicketError("No enabled department matches this panel.");
        const { ChannelType, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, } = this.sdk.discord;
        const channel = await ctx.guild.channels.fetch(input.options.getChannel("channel", true).id);
        if (!channel ||
            channel.type !== ChannelType.GuildText ||
            !channel.permissionsFor(ctx.actor)?.has([P.ViewChannel, P.SendMessages]) ||
            !channel.permissionsFor(ctx.bot)?.has([P.ViewChannel, P.SendMessages]))
            throw new TicketError("Choose a text channel where both you and I can view and send messages.");
        const row = profiles.length === 1
            ? new ActionRowBuilder().addComponents(new ButtonBuilder()
                .setCustomId(`bt:open:${profiles[0].key}`)
                .setLabel(`Open ${profiles[0].title}`.slice(0, 80))
                .setStyle(ButtonStyle.Primary))
            : new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId("bt:departments")
                .setPlaceholder("Choose a support department")
                .addOptions(profiles.map((profile) => ({ label: profile.title, value: profile.key }))));
        await channel.send({
            content: input.options.getString("message") ??
                "Need help? Choose a support department to open a private ticket.",
            components: [row],
            allowedMentions: { parse: [] },
        });
        await this.reply(ctx, `Published a persistent ticket panel in <#${channel.id}>.`);
    }
    async component(input) {
        if (!input.customId.startsWith("bt:"))
            return;
        if (!input.isModalSubmit() && input.message.author.id !== input.client.user?.id)
            return;
        const parts = input.customId.split(":");
        if (parts[1] === "open" || parts[1] === "departments") {
            try {
                if (!input.inCachedGuild() || input.isModalSubmit())
                    return;
                const key = input.isStringSelectMenu() ? input.values[0] : parts[2];
                if (!key)
                    throw new TicketError("Choose a department.");
                const profile = await this.store.profile(input.guildId, key);
                if (!profile.enabled)
                    throw new TicketError("This department is disabled.");
                if (profile.questions.length) {
                    const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = this.sdk.discord;
                    const modal = new ModalBuilder()
                        .setTitle(profile.title.slice(0, 45))
                        .setCustomId(`bt:form:${key}:${profile.revision}`);
                    profile.questions.forEach((question, index) => modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
                        .setCustomId(`q${index}`)
                        .setLabel(question.label)
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(question.required)
                        .setMaxLength(1000))));
                    await input.showModal(modal);
                    return;
                }
                await this.execute(input, (ctx) => this.open(ctx, profile, {}));
            }
            catch (error) {
                if (!(error instanceof TicketError))
                    this.sdk.logError(error, "Ticket form failed");
                const message = {
                    content: error instanceof TicketError
                        ? error.message
                        : "The ticket form could not open. Try again.",
                    flags: this.sdk.discord.MessageFlags.Ephemeral,
                    allowedMentions: { parse: [] },
                };
                if (!input.replied && !input.deferred)
                    await input.reply(message);
            }
            return;
        }
        await this.execute(input, async (ctx) => {
            if (parts[1] === "form" && input.isModalSubmit()) {
                const profile = await this.store.profile(ctx.guild.id, parts[2] ?? "");
                if (String(profile.revision) !== parts[3])
                    throw new TicketError("This form changed. Please open it again.");
                const answers = Object.fromEntries(profile.questions.map((question, index) => [
                    question.label,
                    input.fields.getTextInputValue(`q${index}`).trim(),
                ]));
                await this.open(ctx, profile, answers);
                return;
            }
            const number = Number(parts[2]);
            if (!Number.isSafeInteger(number) || number < 1)
                throw new TicketError("Invalid ticket control.");
            if (parts[1] === "confirm" && parts[3] !== ctx.actor.id)
                throw new TicketError("Only the member who requested this close can confirm it.");
            if (parts[1] === "close") {
                const ticket = await this.store.channel(ctx.guild.id, input.channelId);
                if (ticket.number !== number)
                    throw new TicketError("This control belongs to another ticket.");
                if (!this.staff(ctx, ticket.profile) &&
                    (ticket.ownerId !== ctx.actor.id || ticket.profile.staffCloseOnly))
                    throw new TicketError("Only the creator or department staff can close this ticket.");
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = this.sdk.discord;
                await input.editReply({
                    content: `Close ticket #${number} and save its transcript?`,
                    components: [
                        new ActionRowBuilder().addComponents(new ButtonBuilder()
                            .setCustomId(`bt:confirm:${number}:${ctx.actor.id}`)
                            .setLabel("Confirm close")
                            .setStyle(ButtonStyle.Danger)),
                    ],
                });
                return;
            }
            await this.action(ctx, {
                action: parts[1] === "confirm" ? "close" : parts[1],
                number,
                text: "Closed using ticket controls",
            });
        });
    }
    async open(ctx, profile, answers) {
        const { ChannelType, EmbedBuilder, Colors } = this.sdk.discord;
        const category = await ctx.guild.channels.fetch(profile.categoryId);
        if (!category ||
            category.type !== ChannelType.GuildCategory ||
            !category.permissionsFor(ctx.bot)?.has(this.permissions) ||
            !ctx.bot.permissions.has(this.permissions))
            throw new TicketError("The ticket category is unavailable or my permissions have changed.");
        await this.logChannel(ctx.guild, ctx.bot, profile);
        for (const id of profile.supportRoleIds) {
            const role = await ctx.guild.roles.fetch(id);
            if (!role || role.id === ctx.guild.id || role.managed)
                throw new TicketError("A configured support role is no longer available.");
        }
        const ticket = await this.store.reserve(ctx.guild.id, profile.key, ctx.actor.id, new Set(ctx.actor.roles.cache.keys()), answers, profile.revision);
        const channel = await ctx.guild.channels.create({
            name: `ticket-${String(ticket.number).padStart(4, "0")}`,
            type: ChannelType.GuildText,
            parent: profile.categoryId,
            topic: `better-ticket:v1:${ctx.bot.id}:${ticket.number}:${ctx.actor.id}`,
            permissionOverwrites: this.overwrites(ctx, ticket),
            reason: reason(ctx.actor.id, "Open ticket"),
        });
        const saved = await this.store.mutate(ctx.guild.id, ticket.number, ["CREATING"], ctx.actor.id, "opened", (value) => {
            value.channelId = channel.id;
            value.status = "OPEN";
        });
        try {
            const embed = new EmbedBuilder()
                .setColor(Colors.Blurple)
                .setTitle(`Ticket #${ticket.number} · ${profile.title}`)
                .setDescription(`${profile.welcome}\n\nCreator: <@${ctx.actor.id}>`)
                .addFields(Object.entries(answers).map(([name, value]) => ({
                name,
                value: value.slice(0, 900) || "Not supplied",
            })));
            await channel.send({
                embeds: [embed],
                components: [this.controls(saved)],
                allowedMentions: { parse: [] },
            });
        }
        catch (error) {
            this.sdk.logError(error, "Ticket created; welcome delivery failed");
        }
        await this.reply(ctx, `Your private ticket is ready: <#${channel.id}>.`);
    }
    async textChannel(guild, id) {
        const channel = await guild.channels.fetch(id, { force: true });
        if (!channel || channel.type !== this.sdk.discord.ChannelType.GuildText)
            throw new TicketError("That ticket channel no longer exists.");
        return channel;
    }
    async archive(ctx, ticket, channel) {
        const log = await this.logChannel(ctx.guild, ctx.bot, ticket.profile);
        const result = await collectTranscript(channel, ticket);
        const attachment = new this.sdk.discord.AttachmentBuilder(Buffer.from(result.html, "utf8"), {
            name: `better-ticket-${ticket.number}.html`,
        });
        const message = await log.send({
            content: `Ticket #${ticket.number} · creator <@${ticket.ownerId}> · ${result.truncated ? "Partial transcript (export limit reached)" : "Transcript"}`,
            files: [attachment],
            allowedMentions: { parse: [] },
        });
        await this.store.mutate(ctx.guild.id, ticket.number, ["OPEN", "CLOSED", "CLOSING", "DELETING"], ctx.bot.id, "transcript", (value) => {
            value.transcript = {
                channelId: log.id,
                messageId: message.id,
                url: message.url,
                truncated: result.truncated,
                capturedAt: Date.now(),
            };
        });
        return { attachment, url: message.url, truncated: result.truncated };
    }
    async action(ctx, request) {
        const ticket = await this.store.channel(ctx.guild.id, ctx.input.channelId);
        if (request.number && request.number !== ticket.number)
            throw new TicketError("This control belongs to another ticket.");
        if (!ticket.channelId)
            throw new TicketError("Ticket creation is still in progress.");
        const key = `${ctx.guild.id}:${ticket.number}`;
        if (this.busy.has(key))
            throw new TicketError("Another ticket action is running. Please retry shortly.");
        this.busy.add(key);
        try {
            const channel = await this.textChannel(ctx.guild, ticket.channelId);
            const P = this.sdk.discord.PermissionFlagsBits;
            if (!channel.permissionsFor(ctx.actor)?.has(P.ViewChannel))
                throw new TicketError("You cannot access this ticket.");
            const isStaff = this.staff(ctx, ticket.profile);
            if (!isStaff &&
                ticket.ownerId !== ctx.actor.id &&
                !ticket.participants.includes(ctx.actor.id))
                throw new TicketError("You are not a participant in this ticket.");
            if (!["info", "transcript", "close", "rate"].includes(request.action))
                this.requireStaff(ctx, ticket);
            if (!["OPEN", "CLOSED"].includes(ticket.status))
                throw new TicketError(`Ticket is ${ticket.status.toLowerCase()}. Pending operations recover automatically.`);
            if (request.action === "info") {
                const embed = new this.sdk.discord.EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(`Ticket #${ticket.number}`)
                    .setDescription(`Department: ${ticket.profile.title}\nStatus: ${ticket.status}\nOwner: <@${ticket.ownerId}>\nPriority: ${ticket.priority}\nClaim: ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed"}\nParticipants: ${ticket.participants.map((id) => `<@${id}>`).join(", ") || "None"}\nRating: ${ticket.rating ? `${ticket.rating.stars}/5` : "Not rated"}${ticket.transcript ? `\n[Archived transcript](${ticket.transcript.url})` : ""}`);
                await ctx.input.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
                return;
            }
            if (request.action === "transcript") {
                const result = await this.archive(ctx, ticket, channel);
                await ctx.input.editReply({
                    content: `[Archived transcript](${result.url})${result.truncated ? " · Partial export; earlier messages remain in Discord." : ""}`,
                    files: [result.attachment],
                    allowedMentions: { parse: [] },
                });
                return;
            }
            if (request.action === "note") {
                if (request.text) {
                    await this.store.mutate(ctx.guild.id, ticket.number, ["OPEN", "CLOSED"], ctx.actor.id, "note", (value) => {
                        if (value.notes.length >= 50)
                            throw new TicketError("This ticket has reached its 50-note limit.");
                        value.notes.push({ by: ctx.actor.id, text: request.text, at: Date.now() });
                    });
                    await this.reply(ctx, "Private staff note saved.");
                }
                else {
                    const notes = ticket.notes
                        .slice(-3)
                        .map((note) => `**<@${note.by}> · <t:${Math.floor(note.at / 1000)}:f>**\n${note.text}`)
                        .join("\n\n");
                    await ctx.input.editReply({
                        embeds: [
                            new this.sdk.discord.EmbedBuilder()
                                .setColor(0x5865f2)
                                .setTitle("Private staff notes · latest three")
                                .setDescription(notes || "No staff notes saved."),
                        ],
                        allowedMentions: { parse: [] },
                    });
                }
                return;
            }
            if (request.action === "rate") {
                if (ctx.actor.id !== ticket.ownerId || ticket.status !== "CLOSED")
                    throw new TicketError("Only the creator can rate a closed ticket.");
                await this.store.mutate(ctx.guild.id, ticket.number, ["CLOSED"], ctx.actor.id, "rated", (value) => {
                    if (value.rating)
                        throw new TicketError("This ticket has already been rated.");
                    if (!request.stars || request.stars < 1 || request.stars > 5)
                        throw new TicketError("Choose a rating from one to five.");
                    value.rating = { stars: request.stars, comment: request.text ?? "", at: Date.now() };
                });
                await this.reply(ctx, "Thank you. Your rating was saved.");
                return;
            }
            if (request.action === "close") {
                if (!isStaff && (ctx.actor.id !== ticket.ownerId || ticket.profile.staffCloseOnly))
                    throw new TicketError("Only the creator or department staff can close this ticket.");
                const pending = await this.store.transition(ctx.guild.id, ticket, "CLOSING", ctx.actor.id, request.text ?? "Resolved");
                await this.complete(ctx.guild, ctx.bot, pending);
                await this.reply(ctx, "Ticket closed. Its transcript is archived and participants retain read access. Use /bticket rate to leave feedback.");
                return;
            }
            if (request.action === "reopen" || request.action === "delete") {
                if (request.action === "delete" && !request.confirm)
                    throw new TicketError("Set confirm to true to delete this closed ticket channel. The archive and metadata are retained.");
                const pending = await this.store.transition(ctx.guild.id, ticket, request.action === "reopen" ? "REOPENING" : "DELETING", ctx.actor.id, request.action);
                if (request.action === "delete")
                    await this.reply(ctx, "Archiving and deleting this closed ticket channel.");
                await this.complete(ctx.guild, ctx.bot, pending);
                if (request.action === "reopen")
                    await this.reply(ctx, "Ticket reopened.");
                return;
            }
            if (ticket.status !== "OPEN")
                throw new TicketError("Reopen the ticket before changing its workflow.");
            if (request.action === "claim" || request.action === "unclaim") {
                const target = request.member
                    ? await ctx.guild.members.fetch({ user: request.member, force: true })
                    : ctx.actor;
                if (target.id !== ctx.actor.id && !this.manager(ctx))
                    throw new TicketError("Only managers can assign another staff member.");
                const targetContext = { ...ctx, actor: target };
                if (!channel.permissionsFor(target)?.has(P.ViewChannel))
                    throw new TicketError("The assigned staff member must be able to view this ticket.");
                if (!this.staff(targetContext, ticket.profile) || target.user.bot)
                    throw new TicketError("Assign a human member of this department's support team.");
                const updated = await this.store.mutate(ctx.guild.id, ticket.number, ["OPEN"], ctx.actor.id, request.action, (value) => {
                    if (value.claimedBy && value.claimedBy !== ctx.actor.id && !this.manager(ctx))
                        throw new TicketError("Another staff member has claimed this ticket.");
                    value.claimedBy = request.action === "claim" ? target.id : null;
                });
                await this.reply(ctx, updated.claimedBy
                    ? `Ticket assigned to <@${updated.claimedBy}>.`
                    : "Ticket claim released.");
                return;
            }
            if (request.action === "priority") {
                await this.store.mutate(ctx.guild.id, ticket.number, ["OPEN"], ctx.actor.id, "priority", (value) => {
                    if (!request.priority)
                        throw new TicketError("Choose a priority level.");
                    value.priority = request.priority;
                });
                await this.reply(ctx, `Priority set to ${request.priority}.`);
                return;
            }
            if (request.action === "rename") {
                if (!request.text?.trim())
                    throw new TicketError("Supply a channel name.");
                await channel.setName(request.text.trim(), reason(ctx.actor.id, "Rename ticket"));
                await this.store.mutate(ctx.guild.id, ticket.number, ["OPEN"], ctx.actor.id, "renamed", () => { }, request.text);
                await this.reply(ctx, "Ticket channel renamed.");
                return;
            }
            if (request.action === "reply") {
                const state = await this.store.read(ctx.guild.id);
                const name = request.text ?? "";
                if (!Object.hasOwn(state.replies, name))
                    throw new TicketError("Saved reply not found.");
                await channel.send({ content: state.replies[name], allowedMentions: { parse: [] } });
                await this.reply(ctx, "Saved reply sent.");
                return;
            }
            if (request.action === "add" || request.action === "remove") {
                const target = await ctx.guild.members.fetch({ user: request.member, force: true });
                if (target.id === ticket.ownerId || target.id === ctx.bot.id)
                    throw new TicketError("The ticket owner and bot cannot be changed as extra participants.");
                if (request.action === "remove" && this.staff({ ...ctx, actor: target }, ticket.profile))
                    throw new TicketError("Support staff retain access through their roles.");
                if (!channel.permissionsFor(ctx.bot)?.has([P.ManageChannels, P.ManageRoles]))
                    throw new TicketError("I need Manage Channels and Manage Roles in this ticket.");
                if (request.action === "add" &&
                    !ticket.participants.includes(target.id) &&
                    ticket.participants.length >= 25)
                    throw new TicketError("Use at most 25 additional participants.");
                await channel.permissionOverwrites.edit(target, request.action === "add"
                    ? {
                        ViewChannel: true,
                        ReadMessageHistory: true,
                        SendMessages: true,
                        AttachFiles: true,
                        EmbedLinks: true,
                        AddReactions: true,
                        CreatePublicThreads: false,
                        CreatePrivateThreads: false,
                    }
                    : { ViewChannel: false, ReadMessageHistory: false, SendMessages: false }, { reason: reason(ctx.actor.id, request.action + " participant") });
                await this.store.mutate(ctx.guild.id, ticket.number, ["OPEN"], ctx.actor.id, request.action, (value) => {
                    value.participants = value.participants.filter((id) => id !== target.id);
                    if (request.action === "add")
                        value.participants.push(target.id);
                });
                await this.reply(ctx, `${request.action === "add" ? "Added" : "Removed"} <@${target.id}>.`);
                return;
            }
            throw new TicketError("Unsupported ticket action.");
        }
        finally {
            this.busy.delete(key);
        }
    }
    async complete(guild, bot, ticket) {
        if (!ticket.channelId)
            throw new TicketError("Pending ticket has no channel yet.");
        const channel = await this.textChannel(guild, ticket.channelId);
        if (!channel.permissionsFor(bot)?.has(this.permissions))
            throw new TicketError("My ticket channel permissions have changed.");
        if (ticket.status === "CLOSING" || ticket.status === "DELETING") {
            if (!ticket.transcript || ticket.transcript.capturedAt < ticket.pendingSince)
                await this.archive({ guild, bot }, ticket, channel);
            if (ticket.status === "DELETING") {
                await channel.delete(reason(ticket.pendingBy, "Delete archived ticket"));
                await this.store.mutate(guild.id, ticket.number, ["DELETING"], ticket.pendingBy, "deleted", (value) => {
                    value.status = "DELETED";
                });
                return;
            }
            const parent = ticket.profile.archiveCategoryId ?? channel.parentId;
            await channel.edit({
                ...(parent ? { parent } : {}),
                lockPermissions: false,
                permissionOverwrites: this.overwrites({ guild, bot }, ticket, true),
                reason: reason(ticket.pendingBy, ticket.pendingReason),
            });
            const closed = await this.store.mutate(guild.id, ticket.number, ["CLOSING"], ticket.pendingBy, "closed", (value) => {
                value.status = "CLOSED";
                value.closedAt = Date.now();
            }, ticket.pendingReason);
            await channel
                .send({
                content: `Ticket #${ticket.number} closed: ${ticket.pendingReason}\nCreator: use /bticket rate to leave a rating.`,
                components: [this.controls(closed)],
                allowedMentions: { parse: [] },
            })
                .catch((error) => this.sdk.logError(error, "Ticket closed; controls delivery failed"));
            return;
        }
        if (ticket.status === "REOPENING") {
            await channel.edit({
                parent: ticket.profile.categoryId,
                lockPermissions: false,
                permissionOverwrites: this.overwrites({ guild, bot }, ticket),
                reason: reason(ticket.pendingBy, "Reopen ticket"),
            });
            const reopened = await this.store.mutate(guild.id, ticket.number, ["REOPENING"], ticket.pendingBy, "reopened", (value) => {
                value.status = "OPEN";
                value.closedAt = null;
                value.lastActivityAt = Date.now();
            });
            await channel
                .send({
                content: `Ticket #${ticket.number} reopened.`,
                components: [this.controls(reopened)],
                allowedMentions: { parse: [] },
            })
                .catch((error) => this.sdk.logError(error, "Ticket reopened; controls delivery failed"));
        }
    }
    async overview(ctx, input, action) {
        const state = await this.store.read(ctx.guild.id);
        const profiles = Object.values(state.profiles);
        if (!this.manager(ctx) &&
            !ctx.actor.permissions.has(this.sdk.discord.PermissionFlagsBits.ManageChannels) &&
            !profiles.some((profile) => this.staff(ctx, profile)))
            throw new TicketError("Only support staff can view the support queue and statistics.");
        const tickets = Object.values(state.tickets).filter((ticket) => this.staff(ctx, ticket.profile));
        if (action === "queue") {
            const status = input.options.getString("status") ?? "OPEN";
            const page = input.options.getInteger("page") ?? 1;
            const ranks = { urgent: 0, high: 1, normal: 2, low: 3 };
            const visible = tickets
                .filter((ticket) => status === "all" || ticket.status === status)
                .sort((a, b) => ranks[a.priority] - ranks[b.priority] || a.createdAt - b.createdAt);
            const rows = visible
                .slice((page - 1) * 10, page * 10)
                .map((ticket) => `**#${ticket.number}** · ${ticket.priority} · ${ticket.status} · ${ticket.channelId ? `<#${ticket.channelId}>` : "Pending channel"} · ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Unclaimed"}`);
            await this.reply(ctx, `Support queue · page ${page} · ${visible.length} tickets\n\n${rows.join("\n") || "No matching tickets."}`);
            return;
        }
        const ratings = tickets.flatMap((ticket) => (ticket.rating ? [ticket.rating.stars] : []));
        const responses = tickets.flatMap((ticket) => ticket.firstResponseAt ? [Math.max(0, ticket.firstResponseAt - ticket.createdAt)] : []);
        const closed = tickets.filter((ticket) => ticket.closedAt !== null);
        const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        await this.reply(ctx, `**Better Ticket statistics**\nTotal: ${tickets.length}\nOpen: ${tickets.filter((ticket) => ticket.status === "OPEN").length}\nClosed: ${tickets.filter((ticket) => ticket.status === "CLOSED").length}\nDeleted channels: ${tickets.filter((ticket) => ticket.status === "DELETED").length}\nClaimed open tickets: ${tickets.filter((ticket) => ticket.status === "OPEN" && ticket.claimedBy).length}\nAverage rating: ${ratings.length ? average(ratings).toFixed(2) + "/5 (" + ratings.length + ")" : "No ratings"}\nAverage first staff response: ${responses.length ? (average(responses) / 60000).toFixed(1) + " minutes" : "No recorded responses"}\nAverage resolution: ${closed.length ? (average(closed.map((ticket) => ticket.closedAt - ticket.createdAt)) / 60000).toFixed(1) + " minutes" : "No closed tickets"}`);
    }
    async message(message) {
        if (!message.guild ||
            message.author.bot ||
            !("topic" in message.channel) ||
            !message.channel.topic?.startsWith("better-ticket:v1:"))
            return;
        if (!(await this.sdk.verified(message.guild)))
            return;
        const member = message.member ??
            (await message.guild.members.fetch({ user: message.author.id, force: true }));
        await this.store.change(message.guild.id, (state) => {
            const ticket = Object.values(state.tickets).find((ticket) => ticket.channelId === message.channelId && ticket.status === "OPEN");
            if (!ticket)
                return;
            ticket.lastActivityAt = Date.now();
            if (ticket.ownerId !== member.id &&
                !ticket.firstResponseAt &&
                (member.permissions.has(this.sdk.discord.PermissionFlagsBits.ManageChannels) ||
                    member.id === message.guild.ownerId ||
                    ticket.profile.supportRoleIds.some((id) => member.roles.cache.has(id))))
                ticket.firstResponseAt = Date.now();
        });
    }
    async sweep(client) {
        if (this.stopped)
            return;
        if (this.sweeping)
            return this.sweeping;
        this.sweeping = (async () => {
            for (const guild of client.guilds.cache.values()) {
                if (this.stopped)
                    break;
                try {
                    const state = await this.store.read(guild.id);
                    if (!Object.keys(state.tickets).length || !(await this.sdk.verified(guild)))
                        continue;
                    const bot = await guild.members.fetchMe({ force: true });
                    for (const ticket of Object.values(state.tickets)) {
                        if (this.stopped)
                            break;
                        const key = `${guild.id}:${ticket.number}`;
                        if (this.busy.has(key))
                            continue;
                        const pending = ["CREATING", "CLOSING", "REOPENING", "DELETING"].includes(ticket.status) &&
                            Date.now() - ticket.pendingSince > 120000;
                        const idle = ticket.status === "OPEN" &&
                            ticket.profile.autoCloseMinutes > 0 &&
                            Date.now() - ticket.lastActivityAt >= ticket.profile.autoCloseMinutes * 60000;
                        if (!pending && !idle)
                            continue;
                        this.busy.add(key);
                        try {
                            if (ticket.status === "CREATING") {
                                const channels = await guild.channels.fetch();
                                const topic = `better-ticket:v1:${bot.id}:${ticket.number}:${ticket.ownerId}`;
                                const found = channels.find((channel) => channel?.type === this.sdk.discord.ChannelType.GuildText &&
                                    channel.topic === topic);
                                await this.store.mutate(guild.id, ticket.number, ["CREATING"], bot.id, "recovered", (value) => {
                                    value.channelId = found?.id ?? null;
                                    value.status = found ? "OPEN" : "FAILED";
                                });
                                continue;
                            }
                            if (pending) {
                                try {
                                    await this.complete(guild, bot, ticket);
                                }
                                catch (error) {
                                    if (error && typeof error === "object" && "code" in error && error.code === 10003)
                                        await this.store.mutate(guild.id, ticket.number, [ticket.status], bot.id, "channel-missing", (value) => {
                                            value.status = "DELETED";
                                        });
                                    else
                                        throw error;
                                }
                                continue;
                            }
                            const fresh = await this.store.find(guild.id, ticket.number);
                            if (fresh.status !== "OPEN" ||
                                Date.now() - fresh.lastActivityAt < fresh.profile.autoCloseMinutes * 60000)
                                continue;
                            const next = await this.store.transition(guild.id, fresh, "CLOSING", bot.id, "Automatically closed after inactivity", fresh.lastActivityAt);
                            await this.complete(guild, bot, next);
                        }
                        catch (error) {
                            this.sdk.logError(error, "Ticket recovery or inactivity closure failed");
                        }
                        finally {
                            this.busy.delete(key);
                        }
                    }
                }
                catch (error) {
                    this.sdk.logError(error, "Better Ticket guild maintenance failed");
                }
            }
        })().finally(() => {
            this.sweeping = undefined;
        });
        return this.sweeping;
    }
    attach(client) {
        this.stopped = false;
        const timer = setInterval(() => void this.sweep(client), 60000);
        timer.unref();
        if (client.isReady())
            void this.sweep(client);
        return async () => {
            this.stopped = true;
            clearInterval(timer);
            await this.sweeping;
        };
    }
    stop() {
        this.stopped = true;
    }
}
