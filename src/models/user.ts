export interface UserObject {
  id: string;
  nickname?: string;
}

export class User {
  constructor(public id: string, public nickname?: string) {}

  toJson(): UserObject {
    return {
      id: this.id,
      nickname: this.nickname,
    };
  }
}
