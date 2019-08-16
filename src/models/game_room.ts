import { GameRoomSettings, GameRoomSettingsObject } from './game_room_settings';
import { Game, GameObject } from './game';
import { User, UserObject } from './user';

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
  player1?: UserObject;
  player2?: UserObject;
  spectators: UserObject[];
  game?: GameObject;
  gameInProgress: boolean;
  player1Restart: boolean;
  player2Restart: boolean;
}

class GameRoom {
  gameInProgress = false;

  player1Restart: boolean = false;
  player2Restart: boolean = false;

  constructor(
    public id: string,
    public settings: GameRoomSettings,
    public player1?: User,
    public player2?: User,
    public spectators: User[] = [],
    public game?: Game,
  ) {}

  toJson(): GameRoomObject {
    return {
      id: this.id,
      settings: this.settings,
      player1: this.player1 === undefined ? undefined : this.player1.toJson(),
      player2: this.player2 === undefined ? undefined : this.player2.toJson(),
      spectators: this.spectators.map(user => user.toJson()),
      game: this.game === undefined ? undefined : this.game.toJson(),
      gameInProgress: this.gameInProgress,
      player1Restart: this.player1Restart,
      player2Restart: this.player2Restart,
    };
  }

  get canResetGame(): boolean {
    // Game did not start, cannot reset
    if (this.game === undefined) {
      return false;
    }

    // Can reset the game if the game finished and all players inside the room choose to restart
    return !this.gameInProgress && (this.player1Restart || this.player1 === undefined) && (this.player2Restart || this.player2 === undefined);
  }

  resetGame() {
    this.player1Restart = false;
    this.player2Restart = false;
    this.game = undefined;
  }

  get isEmpty(): boolean {
    return this.player1 === undefined && this.player2 === undefined && this.spectators.length === 0;
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

  onUserJoin(role: GameRoomRole, user: User): boolean {
    switch (role) {
      case GameRoomRole.Player1:
        if (this.player1 === undefined && !this.gameInProgress) {
          this.player1 = user;
          return true;
        }
        break;
      case GameRoomRole.Player2:
        if (this.player2 === undefined && !this.gameInProgress) {
          this.player2 = user;
          return true;
        }
        break;
      case GameRoomRole.Spectator:
        if (this.settings.allowSpectators) {
          this.spectators.push(user);
          return true;
        }
        break;
    }
    return false;
  }

  onUserLeave(role: GameRoomRole, user: User) {
    switch (role) {
      case GameRoomRole.Player1:
        this.player1 = undefined;
        this.player1Restart = false;
        break;
      case GameRoomRole.Player2:
        this.player2 = undefined;
        this.player2Restart = false;
        break;
      case GameRoomRole.Spectator:
        const index = this.spectators.indexOf(user);
        if (index !== -1) {
          this.spectators.splice(index, 1);
        }
        break;
    }
  }
}

export { GameRoomRole, GameRoom, gameRoomRoleFrom };
