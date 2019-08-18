import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import bodyParser from 'body-parser';
import uuidv1 from 'uuid/v1';
import { GameRoomSettings, GameRoomSettingsError } from './models/game_room_settings';
import { GameRoom, gameRoomRoleFrom, GameRoomRole } from './models/game_room';
import { Point, Side } from './models/game';
import { User, UserObject } from './models/user';

const port = 8080;

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const rooms: GameRoom[] = [new GameRoom('ok', new GameRoomSettings())];

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('Connect 5 Server.');
});

/*
  Post Object:
    - settings: GameRoomSettings | undefined
    - roomId: string

  Success Object:
    - room: GameRoomObject

  Errors:
    - invalid settings or roomId
    - roomId already exists
*/
type CreateRoomError = GameRoomSettingsError | 'invalid_room_id' | 'room_id_taken';

// TODO: add join-room login into here so client only needs to call create-room instead of create-room then join-room
app.post('/create-room', (req, res) => {
  function fail(error: CreateRoomError) {
    res.status(400).send({ error });
  }

  const settings = GameRoomSettings.fromJson(req.body.settings);

  if (!(settings instanceof GameRoomSettings)) {
    fail(settings);
    return;
  }

  const roomId = req.body.id;

  if (typeof roomId !== 'string' || roomId.trim().length == 0) {
    fail('invalid_room_id');
    return;
  }

  if (rooms.find(room => room.id === roomId)) {
    fail('room_id_taken');
    return;
  }

  const room = new GameRoom(roomId, settings);
  rooms.push(room);

  res.status(200).send({
    room: room.toJson(),
  });
});

type JoinRoomError = 'invalid_role' | 'invalid_room_id';

app.post('/join-room', (req, res) => {
  function fail(error: JoinRoomError) {
    res.status(400).send({ error });
  }

  const roomId = req.body.roomId;
  const role = gameRoomRoleFrom(req.body.role);

  let nickname: string | undefined = req.body.nickname;

  if (typeof nickname !== 'string') {
    nickname = undefined;
  }

  if (typeof roomId !== 'string') {
    fail('invalid_room_id');
    return;
  }

  if (role === undefined) {
    fail('invalid_role');
    return;
  }

  const room = rooms.find((room) => room.id === roomId);

  if (room === undefined) {
    fail('invalid_room_id');
    return;
  }

  const userId = uuidv1();
  const user = new User(userId, nickname, false);

  if (!room.onUserJoin(role, user)) {
    fail('invalid_role');
    return;
  }

  const pendingUser = { user, room, role };
  pendingUsers.push(pendingUser);

  res.status(200).send({ userId });

  setTimeout(() => {
    // If user does not connect to socket after delay, it will be removed from pending users and the room
    const index = pendingUsers.indexOf(pendingUser);
    if (index !== -1) {
      pendingUsers.splice(index, 1);
      pendingUser.room.onUserLeave(role, user);
    }
  }, 10000);
});

/// Users pending to connect to socket after calling join-room or create-room
type PendingUser = {
  user: User;
  room: GameRoom;
  role: GameRoomRole;
}
const pendingUsers: PendingUser[] = [];

const disconnectedUsers: PendingUser[] = [];

// Get the list of currently active rooms
app.get('/rooms', (_, res) => {
  res.status(200).send({
    rooms: rooms.filter(room => room.settings.isPublic).map(room => room.toJson()),
  });
});

type GetRoomError = 'invalid_room_id' | 'room_not_found';

app.get('/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId;

  function fail(error: GetRoomError) {
    res.status(400).send({ error });
  }

  if (typeof roomId !== 'string') {
    fail('invalid_room_id');
    return;
  }

  const room = rooms.find(room => room.id === roomId);

  if (room === undefined) {
    fail('room_not_found');
    return;
  }

  res.status(200).send({
    room: room.toJson(),
  });
});

const Events = {
  failToJoin: 'fail-to-join',
  failToAddStep: 'fail-to-add-step',
  roomUpdated: 'room-updated',
};

type RoomEvent =
    {
      description: 'user-joined' | 'user-left' | 'user-set-restart' | 'user-disconnected' | 'user-reconnected',
      user: UserObject,
      role: number,
    }
  | {
      description: 'start-game' | 'step-added' | 'game-ended' | 'game-reset',
    };

const UserEvents = {
  addStep: 'add-step',
  restartGame: 'restart-game',
  leaveGame: 'leave-game',
};

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

type ConnectRoomError = 'invalid_user_id' | 'connection_timeout';

io.on('connection', socket => {
  const userId = socket.handshake.query.userId;

  function fail(error: ConnectRoomError) {
    socket.emit(Events.failToJoin, { error });
    socket.disconnect(true);
  }

  if (typeof userId !== 'string') {
    fail('invalid_user_id');
    return;
  }

  // Find user in pending users
  const pendingIndex = pendingUsers.findIndex((pendingUser) => pendingUser.user.id === userId);

  if (pendingIndex !== -1) {
    const pendingUser = pendingUsers[pendingIndex];

    // User connected, remove from pending
    pendingUsers.splice(pendingIndex, 1);

    handleUserConnected(socket, pendingUser);
    return;
  }

  const disconnectedIndex = disconnectedUsers.findIndex((disconnectedUser) => disconnectedUser.user.id === userId);

  if (disconnectedIndex !== -1) {
    const disconnectedUser = disconnectedUsers[disconnectedIndex];

    disconnectedUsers.splice(disconnectedIndex, 1);

    handleUserReconnected(socket, disconnectedUser);
    return;
  }

  // Cannot find pending or disconnected user matching id, failed due to timeout
  fail('connection_timeout');
});

/// Emit an event to a room, with updated room object
function emitRoom(room: GameRoom, event: RoomEvent) {
  io.to(room.id).emit(Events.roomUpdated, {
    room: room.toJson(),
    event,
  });
}

/// Handle user reconnecting to a room after being temporarily disconnected
function handleUserReconnected(socket: socketio.Socket, { user, room, role }: PendingUser) {
  user.isConnected = true;

  socket.join(room.id);

  emitRoom(room, {
    description: 'user-reconnected',
    user: user.toJson(),
    role: role.valueOf(),
  })

  subscribeToSocketEvents(socket, user, room, role);
}

/// Handle user initially connecting to a room
function handleUserConnected(socket: socketio.Socket, { user, room, role }: PendingUser) {
  user.isConnected = true;

  // Join room success
  socket.join(room.id);

  emitRoom(room, {
    description: 'user-joined',
    user: user.toJson(),
    role: role.valueOf(),
  });

  subscribeToSocketEvents(socket, user, room, role);
}

/// Subscribe to socket events of user
function subscribeToSocketEvents(socket: socketio.Socket, user: User, room: GameRoom, role: GameRoomRole) {
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
      emitRoom(room, { description: 'step-added' });

      if (game.isFinished) {
        emitRoom(room, { description: 'game-ended' });
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
    emitRoom(room, {
      description: 'user-set-restart',
      user: user.toJson(),
      role: role.valueOf(),
    });

    if (startGame) {
      emitRoom(room, { description: 'start-game' });
    } else if (resetGame) {
      emitRoom(room, { description: 'game-reset' });
    }
  });

  // Start game if both players joined
  if (room.canStartGame && room.game === undefined) {
    room.startGame();
    emitRoom(room, { description: 'start-game' });
  }

  function handleUserLeft() {
    room.onUserLeave(role, user);

    if (room.isEmpty) {
      // Room is empty, can delete
      rooms.splice(rooms.indexOf(room));
    } else {
      // End game if one of the players left
      let endedGame = false;
      if (room.gameInProgress && role !== GameRoomRole.Spectator) {
        endedGame = true;
        room.endGame();
      } else if (room.canResetGame) {
        room.resetGame();
        emitRoom(room, { description: 'game-reset' });
      }

      emitRoom(room, {
        description: 'user-left',
        user: user.toJson(),
        role: role.valueOf(),
      });

      if (endedGame) {
        emitRoom(room, { description: 'game-ended' });
      }
    }

    socket.removeAllListeners();
    socket.disconnect(true);
  }

  socket.on(UserEvents.leaveGame, () => {
    handleUserLeft();
  });

  socket.on('disconnect', () => {
    user.isConnected = false;

    emitRoom(room, {
      description: 'user-disconnected',
      user: user.toJson(),
      role: role.valueOf(),
    })

    const disconnectedUser = { user, room, role };
    disconnectedUsers.push(disconnectedUser);

    // Make user leave the room after a delay
    setTimeout(() => {
      const index = disconnectedUsers.indexOf(disconnectedUser);
      if (index !== -1) {
        disconnectedUsers.splice(index, 1);
        handleUserLeft();
      }
    }, 1000 * 60); // max 1 minute timeout
  });
}

server.listen(port, () => console.log(`Connect 5 Server started at http://localhost:${port}`));
