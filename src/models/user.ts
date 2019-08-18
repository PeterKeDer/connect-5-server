export interface UserObject {
  id: string;
  nickname?: string;
  isConnected: boolean;
}

export class User {
  constructor(public id: string, public nickname?: string, public isConnected: boolean = true) {}

  toJson(): UserObject {
    return {
      id: this.id,
      nickname: this.nickname,
      isConnected: this.isConnected,
    };
  }
}
