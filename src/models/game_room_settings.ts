export interface GameRoomSettingsObject {
  boardSize: number;
  allowSpectators: boolean;
  isPublic: boolean;
}

export type GameRoomSettingsError = 'invalid_board_size';

export class GameRoomSettings {
  constructor(public boardSize: number = 15, public allowSpectators: boolean = true, public isPublic: boolean = true) {}

  static fromJson(json: any): GameRoomSettings | GameRoomSettingsError {
    if (json === undefined) {
      return new GameRoomSettings();
    }

    const boardSize = typeof json.boardSize === 'number' ? json.boardSize : 15;
    const allowSpectators = typeof json.allowSpectators === 'boolean' ? json.allowSpectators : true;
    const isPublic = typeof json.isPublic === 'boolean' ? json.isPublic : true;

    if (boardSize < 9 || 19 < boardSize) {
      return 'invalid_board_size';
    }

    return new GameRoomSettings(boardSize, allowSpectators, isPublic);
  }

  toJson(): GameRoomSettingsObject {
    return {
      boardSize: this.boardSize,
      allowSpectators: this.allowSpectators,
      isPublic: this.isPublic,
    };
  }
}
