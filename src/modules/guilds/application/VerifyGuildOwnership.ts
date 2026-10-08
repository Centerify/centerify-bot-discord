export interface OwnershipRepository {
  ownerFor(guildId: string): Promise<string | null>;
  save(guildId: string, ownerUserId: string): Promise<void>;
  remove(guildId: string): Promise<void>;
}

export class VerifyGuildOwnership {
  constructor(private readonly repository: OwnershipRepository) {}

  async isVerified(guildId: string, currentOwnerId: string) {
    return await this.repository.ownerFor(guildId) === currentOwnerId;
  }

  async verify(guildId: string, currentOwnerId: string, actorId: string) {
    if (currentOwnerId !== actorId) return false;
    await this.repository.save(guildId, actorId);
    return true;
  }

  async unverify(guildId: string, currentOwnerId: string, actorId: string) {
    if (currentOwnerId !== actorId) return false;
    await this.repository.remove(guildId);
    return true;
  }
}
