export class TicketError extends Error {
    name = "TicketError";
}
export function schemas(z) {
    const snowflake = z.string().regex(/^\d{17,20}$/);
    const key = z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,23}$/)
        .refine((value) => !["constructor", "prototype"].includes(value));
    const profile = z.object({
        key,
        title: z.string().min(1).max(80),
        categoryId: snowflake,
        supportRoleIds: z.array(snowflake).min(1).max(5),
        transcriptChannelId: snowflake,
        archiveCategoryId: snowflake.nullable().default(null),
        welcome: z.string().min(1).max(1000).default("A support team member will be with you shortly."),
        questions: z
            .array(z.object({ label: z.string().min(1).max(45), required: z.boolean() }))
            .max(5)
            .default([{ label: "How can we help?", required: true }]),
        enabled: z.boolean().default(true),
        openLimit: z.number().int().min(1).max(5).default(1),
        cooldownSeconds: z.number().int().min(0).max(86400).default(60),
        autoCloseMinutes: z.number().int().min(0).max(43200).default(0),
        requiredRoleId: snowflake.nullable().default(null),
        staffCloseOnly: z.boolean().default(false),
        revision: z.number().int().positive().default(1),
    });
    const status = z.enum([
        "CREATING",
        "OPEN",
        "CLOSING",
        "CLOSED",
        "REOPENING",
        "DELETING",
        "DELETED",
        "FAILED",
    ]);
    const ticket = z.object({
        number: z.number().int().positive(),
        channelId: snowflake.nullable(),
        ownerId: snowflake,
        profile,
        status,
        createdAt: z.number().int().nonnegative(),
        lastActivityAt: z.number().int().nonnegative(),
        closedAt: z.number().int().nullable(),
        claimedBy: snowflake.nullable(),
        priority: z.enum(["low", "normal", "high", "urgent"]),
        tags: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
        participants: z.array(snowflake).max(25),
        firstResponseAt: z.number().int().nullable().default(null),
        answers: z.record(z.string().max(45), z.string().max(1000)),
        notes: z
            .array(z.object({ by: snowflake, text: z.string().min(1).max(1000), at: z.number() }))
            .max(50),
        events: z
            .array(z.object({
            by: snowflake,
            action: z.string().max(30),
            text: z.string().max(1000),
            at: z.number(),
        }))
            .max(100),
        rating: z
            .object({
            stars: z.number().int().min(1).max(5),
            comment: z.string().max(500),
            at: z.number(),
        })
            .nullable(),
        transcript: z
            .object({
            channelId: snowflake,
            messageId: snowflake,
            url: z.string().url(),
            truncated: z.boolean(),
            capturedAt: z.number().int(),
        })
            .nullable(),
        pendingBy: snowflake,
        pendingReason: z.string().max(1000),
        pendingSince: z.number().int().nonnegative(),
    });
    const state = z
        .object({
        version: z.literal(1).default(1),
        nextNumber: z.number().int().positive().default(1),
        profiles: z
            .record(key, profile)
            .refine((items) => Object.keys(items).length <= 10)
            .default({}),
        tickets: z
            .record(z.string().regex(/^\d+$/), ticket)
            .refine((items) => Object.keys(items).length <= 1000)
            .default({}),
        blockedUserIds: z.array(snowflake).max(100).default([]),
        replies: z
            .record(key, z.string().min(1).max(1800))
            .refine((items) => Object.keys(items).length <= 20)
            .default({}),
    })
        .superRefine((value, context) => {
        for (const [key, ticket] of Object.entries(value.tickets))
            if (key !== String(ticket.number))
                context.addIssue({ code: "custom", message: "Ticket identity mismatch" });
        for (const [key, profile] of Object.entries(value.profiles))
            if (key !== profile.key)
                context.addIssue({ code: "custom", message: "Profile identity mismatch" });
    });
    return { state, profile, key };
}
const active = ["CREATING", "OPEN", "CLOSING", "REOPENING"];
export class TicketStore {
    sdk;
    now;
    schema;
    constructor(sdk, now = Date.now) {
        this.sdk = sdk;
        this.now = now;
        this.schema = schemas(sdk.z);
    }
    async read(guildId) {
        return this.schema.state.parse((await this.sdk.storage.read(guildId)) ?? {});
    }
    parseProfile(input) {
        return this.schema.profile.parse(input);
    }
    change(guildId, operation) {
        return this.sdk.storage.update(guildId, (raw) => {
            const state = this.schema.state.parse(raw ?? {});
            const result = operation(state);
            return { value: this.schema.state.parse(state), result };
        });
    }
    async profile(guildId, key) {
        this.schema.key.parse(key);
        const state = await this.read(guildId);
        const profile = Object.hasOwn(state.profiles, key) ? state.profiles[key] : null;
        if (!profile)
            throw new TicketError("That ticket department is not configured.");
        return profile;
    }
    async saveProfile(guildId, input) {
        const profile = this.schema.profile.parse(input);
        return this.change(guildId, (state) => {
            if (!Object.hasOwn(state.profiles, profile.key) && Object.keys(state.profiles).length >= 10)
                throw new TicketError("Use at most 10 ticket departments.");
            const old = Object.hasOwn(state.profiles, profile.key) ? state.profiles[profile.key] : null;
            profile.revision = (old?.revision ?? 0) + 1;
            state.profiles[profile.key] = profile;
            return profile;
        });
    }
    reserve(guildId, key, userId, roles, answers, expectedRevision) {
        return this.change(guildId, (state) => {
            const profile = Object.hasOwn(state.profiles, key) ? state.profiles[key] : null;
            if (expectedRevision !== undefined && profile?.revision !== expectedRevision)
                throw new TicketError("This department changed. Please open its form again.");
            if (!profile?.enabled)
                throw new TicketError("This ticket department is disabled or not configured.");
            if (state.blockedUserIds.includes(userId))
                throw new TicketError("You are blocked from opening tickets in this server.");
            if (profile.requiredRoleId && !roles.has(profile.requiredRoleId))
                throw new TicketError("You do not have the role required by this department.");
            const own = Object.values(state.tickets).filter((ticket) => ticket.ownerId === userId);
            const open = own.filter((ticket) => active.includes(ticket.status));
            if (open.length >= profile.openLimit)
                throw new TicketError(`You already have ${open.length} active ticket(s).${open[0]?.channelId ? ` Open <#${open[0].channelId}>.` : " A ticket operation may still be recovering."}`);
            const latest = own
                .filter((ticket) => ticket.status !== "FAILED")
                .sort((a, b) => b.createdAt - a.createdAt)[0];
            if (latest && this.now() - latest.createdAt < profile.cooldownSeconds * 1000)
                throw new TicketError("Please wait for your ticket cooldown before opening another ticket.");
            if (Object.keys(state.tickets).length >= 1000)
                throw new TicketError("This server has reached its 1000-ticket retention limit. The bot operator must export and archive old plugin records.");
            for (const question of profile.questions)
                if (question.required &&
                    (!Object.hasOwn(answers, question.label) || !answers[question.label]?.trim()))
                    throw new TicketError(`Complete the required field: ${question.label}`);
            if (Object.keys(answers).some((label) => !profile.questions.some((question) => question.label === label)))
                throw new TicketError("The form changed. Please open it again.");
            const number = state.nextNumber++;
            const ticket = {
                number,
                channelId: null,
                ownerId: userId,
                profile: structuredClone(profile),
                status: "CREATING",
                createdAt: this.now(),
                lastActivityAt: this.now(),
                closedAt: null,
                claimedBy: null,
                priority: "normal",
                tags: [],
                participants: [],
                firstResponseAt: null,
                answers,
                notes: [],
                events: [],
                rating: null,
                transcript: null,
                pendingBy: userId,
                pendingReason: "",
                pendingSince: this.now(),
            };
            state.tickets[String(number)] = ticket;
            return ticket;
        });
    }
    async find(guildId, number) {
        const state = await this.read(guildId);
        const ticket = state.tickets[String(number)];
        if (!ticket)
            throw new TicketError("Ticket not found in this server.");
        return ticket;
    }
    async channel(guildId, channelId) {
        const state = await this.read(guildId);
        const ticket = Object.values(state.tickets).find((ticket) => ticket.channelId === channelId);
        if (!ticket)
            throw new TicketError("Use this command inside a Better Ticket channel.");
        return ticket;
    }
    mutate(guildId, number, states, by, action, operation, text = "") {
        return this.change(guildId, (state) => {
            const ticket = state.tickets[String(number)];
            if (!ticket)
                throw new TicketError("Ticket not found in this server.");
            if (!states.includes(ticket.status))
                throw new TicketError(`Ticket is ${ticket.status.toLowerCase()}. Another action may be in progress.`);
            operation(ticket);
            ticket.events.push({ by, action, text: text.slice(0, 1000), at: this.now() });
            ticket.events = ticket.events.slice(-100);
            return ticket;
        });
    }
    transition(guildId, ticket, status, by, reason, expectedActivity) {
        return this.change(guildId, (state) => {
            const value = state.tickets[String(ticket.number)];
            const expected = status === "CLOSING" ? "OPEN" : "CLOSED";
            if (!value || value.status !== expected)
                throw new TicketError("Another ticket action is in progress, or the ticket is in the wrong state.");
            if (expectedActivity !== undefined && value.lastActivityAt !== expectedActivity)
                throw new TicketError("Ticket activity changed before automatic closure.");
            if (status === "REOPENING") {
                if (state.blockedUserIds.includes(value.ownerId))
                    throw new TicketError("The creator is blocked from opening or reopening tickets.");
                if (Object.values(state.tickets).filter((item) => item.ownerId === value.ownerId && active.includes(item.status)).length >= value.profile.openLimit)
                    throw new TicketError("Reopening this ticket would exceed the creator's active ticket limit.");
            }
            value.status = status;
            value.pendingBy = by;
            value.pendingReason = reason.slice(0, 1000);
            value.pendingSince = this.now();
            value.events.push({ by, action: status, text: reason.slice(0, 1000), at: this.now() });
            value.events = value.events.slice(-100);
            return value;
        });
    }
}
