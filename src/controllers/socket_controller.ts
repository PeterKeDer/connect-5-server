import { Socket, Server } from 'socket.io';
import { Events, UserEvents, RoomEvent } from '../socket_events';
import { UserManager, PendingUser } from '../helpers/user_manager';
import { RoomManager } from '../helpers/room_manager';
import { GameRoomRole, GameRoom } from '../models/game_room';
import { Point, Side } from '../models/game';
import { User } from '../models/user';

type ConnectRoomError = 'invalid_user_id' | 'connection_timeout';

export class SocketController {
  constructor(public io: Server) {}

  /*
    Handshake Query:
      - roomId: string
      - role: 1, 2, or 3
      - nickname: string | undefined

    Errors:
      - invalid roomId
      - invalid role
      - room does not exist
      - cannot join room. This includes:
        - role is player1 / player2, but room's player1 / player2 is already taken
        - role is spectator, but room does not allow spectators
  */
  public handleSocketConnection = (socket: Socket) => {
    const userId = socket.handshake.query.userId;

    function fail(error: ConnectRoomError) {
      socket.emit(Events.failToJoin, { error });
      socket.disconnect(true);
    }

    if (typeof userId !== 'string') {
      fail('invalid_user_id');
      return;
    }

    const userAndStatus = UserManager.shared.getPendingUserAndStatus(userId);

    switch (userAndStatus.status) {
      case 'pending':
        // Found user as pending - connect
        const pendingUser = userAndStatus.user;
        UserManager.shared.removeFromPending(pendingUser.user.id);
        this.handleUserConnected(socket, pendingUser.user, pendingUser.room, pendingUser.role);
        break;

      case 'disconnected':
        // Found user temporarily disconnected
        const disconnectedUser = userAndStatus.user;
        UserManager.shared.removeFromDisconnected(disconnectedUser.user.id);
        this.handleUserReconnected(socket, disconnectedUser.user, disconnectedUser.room, disconnectedUser.role);
        break;

      case 'timeout':
        // Cannot find pending or disconnected user matching id, failed due to timeout
        fail('connection_timeout');
        break;
    }
  };

  /// Emit an event to a room, with updated room object
  private emitRoom(room: GameRoom, event: RoomEvent) {
    this.io.to(room.id).emit(Events.roomUpdated, {
      room: room.toJson(),
      event,
    });
  }

  /// Handle user reconnecting to a room after being temporarily disconnected
  private handleUserReconnected(socket: Socket, user: User, room: GameRoom, role: GameRoomRole) {
    user.isConnected = true;

    socket.join(room.id);

    this.emitRoom(room, {
      description: 'user-reconnected',
      user: user.toJson(),
      role: role.valueOf(),
    });

    this.subscribeToSocketEvents(socket, user, room, role);
  }

  /// Handle user initially connecting to a room
  private handleUserConnected(socket: Socket, user: User, room: GameRoom, role: GameRoomRole) {
    user.isConnected = true;

    // Join room success
    socket.join(room.id);

    this.emitRoom(room, {
      description: 'user-joined',
      user: user.toJson(),
      role: role.valueOf(),
    });

    this.subscribeToSocketEvents(socket, user, room, role);
  }

  /// Subscribe to socket events of user
  private subscribeToSocketEvents(socket: Socket, user: User, room: GameRoom, role: GameRoomRole) {
    socket.on(UserEvents.addStep, param => {
      if (role !== GameRoomRole.Spectator && room.gameInProgress && room.game !== undefined) {
        const game = room.game;

        if (game.isFinished) {
          socket.emit(Events.failToAddStep);
          return;
        }

        const point = Point.fromJson(param.point);

        if (point === undefined) {
          socket.emit(Events.failToAddStep);
          return;
        }

        const side = game.currentSide;

        // Check if player adding step is on the right side
        if ((role === GameRoomRole.Player1 && side !== Side.Black) || (role === GameRoomRole.Player2 && side !== Side.White)) {
          socket.emit(Events.failToAddStep);
          return;
        }

        try {
          game.addStep(point);
        } catch (error) {
          // Out of range, spot taken, etc.
          socket.emit(Events.failToAddStep);
          return;
        }

        if (game.isFinished) {
          room.endGame();
        }

        // Add step success
        this.emitRoom(room, { description: 'step-added' });

        if (game.isFinished) {
          this.emitRoom(room, { description: 'game-ended' });
        }
      }
    });

    socket.on(UserEvents.restartGame, () => {
      // Cannot restart if user is a spectator, game is still on, or game hasn't started yet
      if (role === GameRoomRole.Spectator || room.gameInProgress || room.game === undefined) {
        return;
      }

      switch (role) {
        case GameRoomRole.Player1:
          if (room.player1Restart) {
            return;
          }
          room.player1Restart = true;
          break;
        case GameRoomRole.Player2:
          if (room.player2Restart) {
            return;
          }
          room.player2Restart = true;
          break;
      }

      var resetGame = false;
      var startGame = false;

      if (room.canResetGame) {
        // Start the game immediately if possible. Otherwise reset (clear) the game
        room.resetGame();
        resetGame = true;

        if (room.canStartGame) {
          room.startGame();
          startGame = true;
        }
      }

      // Emit event after updating room
      this.emitRoom(room, {
        description: 'user-set-restart',
        user: user.toJson(),
        role: role.valueOf(),
      });

      if (startGame) {
        this.emitRoom(room, { description: 'start-game' });
      } else if (resetGame) {
        this.emitRoom(room, { description: 'game-reset' });
      }
    });

    // Start game if both players joined
    if (room.canStartGame && room.game === undefined) {
      room.startGame();
      this.emitRoom(room, { description: 'start-game' });
    }

    let handleUserLeft = () => {
      room.onUserLeave(role, user);

      if (room.isEmpty) {
        // Room is empty, can delete
        RoomManager.shared.removeRoom(room);
      } else {
        // End game if one of the players left
        let endedGame = false;
        if (room.gameInProgress && role !== GameRoomRole.Spectator) {
          endedGame = true;
          room.endGame();
        } else if (room.canResetGame) {
          room.resetGame();
          this.emitRoom(room, { description: 'game-reset' });
        }

        this.emitRoom(room, {
          description: 'user-left',
          user: user.toJson(),
          role: role.valueOf(),
        });

        if (endedGame) {
          this.emitRoom(room, { description: 'game-ended' });
        }
      }

      socket.removeAllListeners();
      socket.disconnect(true);
    };

    socket.on(UserEvents.leaveGame, handleUserLeft);

    socket.on('disconnect', () => {
      user.isConnected = false;

      this.emitRoom(room, {
        description: 'user-disconnected',
        user: user.toJson(),
        role: role.valueOf(),
      });

      UserManager.shared.addDisconnectedUser(user, room, role, handleUserLeft);
    });
  }
}
