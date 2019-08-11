import { GameRoomSettings, GameRoomSettingsObject } from './game_room_settings';
import { Game, GameObject } from './game';

enum GameRoomRole {
  Player1 = 1,
  Player2,
  Spectator,
}

function gameRoomRoleFrom(n: any): GameRoomRole | undefined {
  if (typeof n !== 'number') {
    return;
  }

  switch (n) {
    case 1:
      return GameRoomRole.Player1;
    case 2:
      return GameRoomRole.Player2;
    case 3:
      return GameRoomRole.Spectator;
  }
}

interface GameRoomObject {
  id: string;
  settings: GameRoomSettingsObject;
  player1?: string;
  player2?: string;
  spectators: string[];
  game?: GameObject;
  gameInProgress: boolean;
}

class GameRoom {
  gameInProgress = false;

  constructor(
    public id: string,
    public settings: GameRoomSettings,
    public player1?: string,
    public player2?: string,
    public spectators: string[] = [],
    public game?: Game,
  ) {}

  toJson(): GameRoomObject {
    return {
      id: this.id,
      settings: this.settings,
      player1: this.player1,
      player2: this.player2,
      spectators: this.spectators,
      game: this.game === undefined ? undefined : this.game.toJson(),
      gameInProgress: this.gameInProgress,
    };
  }

  get canStartGame(): boolean {
    return this.player1 !== undefined && this.player2 !== undefined;
  }

  startGame(): Game {
    this.game = new Game(this.settings.boardSize);
    this.gameInProgress = true;
    return this.game;
  }

  endGame() {
    this.gameInProgress = false;
  }

  onUserJoin(role: GameRoomRole, userId: string): boolean {
    switch (role) {
      case GameRoomRole.Player1:
        if (this.player1 === undefined) {
          this.player1 = userId;
          return true;
        }
        break;
      case GameRoomRole.Player2:
        if (this.player2 === undefined) {
          this.player2 = userId;
          return true;
        }
        break;
      case GameRoomRole.Spectator:
        if (this.settings.allowSpectators) {
          this.spectators.push(userId);
          return true;
        }
        break;
    }
    return false;
  }

  onUserLeave(role: GameRoomRole, userId: string) {
    switch (role) {
      case GameRoomRole.Player1:
        this.player1 = undefined;
        break;
      case GameRoomRole.Player2:
        this.player2 = undefined;
        break;
      case GameRoomRole.Spectator:
        const index = this.spectators.indexOf(userId);
        if (index !== -1) {
          this.spectators.splice(index, 1);
        }
        break;
    }
  }
}

export { GameRoomRole, GameRoom, gameRoomRoleFrom };
