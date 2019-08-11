export interface GameRoomSettingsObject {
  boardSize: number;
  allowSpectators: boolean;
}

export class GameRoomSettings {
  constructor(public boardSize: number = 15, public allowSpectators: boolean = false) {}

  static fromJson(json: any): GameRoomSettings | undefined {
    if (json === undefined) {
      return new GameRoomSettings();
    }

    let boardSize = json.boardSize || 15;
    let allowSpectators = json.allowSpectators || false;

    if (typeof boardSize !== 'number') {
      return;
    }

    if (boardSize < 9 || 19 < boardSize) {
      return;
    }

    if (typeof allowSpectators !== 'boolean') {
      return;
    }

    return new GameRoomSettings(boardSize, allowSpectators);
  }

  toJson(): GameRoomSettingsObject {
    return {
      boardSize: this.boardSize,
      allowSpectators: this.allowSpectators,
    };
  }
}
