import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import bodyParser from 'body-parser';
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
      description: 'user-joined' | 'user-disconnected' | 'user-set-restart',
      user: UserObject,
      role: number,
    }
  | {
      description: 'start-game' | 'step-added' | 'game-ended' | 'game-reset',
    };

const UserEvents = {
  addStep: 'add-step',
  restartGame: 'restart-game',
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
type JoinRoomError = 'invalid_role' | 'invalid_room_id';

io.on('connection', socket => {
  console.log('User connected');

  const query = socket.handshake.query;
  const roomId = query.roomId;
  const role = gameRoomRoleFrom(Number.parseInt(query.role));

  // If nickname is undefined, display as 'Guest'
  let nickname: string | undefined = query.nickname;

  if (typeof nickname !== 'string' || nickname.trim().length === 0) {
    nickname = undefined;
  }

  const user = new User(socket.id, nickname);

  function fail(error: JoinRoomError) {
    socket.emit(Events.failToJoin, { error });
    socket.disconnect();
  }

  // Check if parameters are valid
  if (role === undefined) {
    fail('invalid_role');
    return;
  }

  if (typeof roomId !== 'string') {
    fail('invalid_room_id');
    return;
  }

  // Get room with roomId
  const room = rooms.find(room => room.id === roomId);

  if (room === undefined) {
    fail('invalid_room_id');
    return;
  }

  if (!room.onUserJoin(role, user)) {
    // Cannot join room with role
    fail('invalid_role');
    return;
  }

  // Join room success
  socket.join(roomId);

  /// Emit an event to room, with updated room object
  function emitRoom(event: RoomEvent) {
    io.to(roomId).emit(Events.roomUpdated, {
      room: room === undefined ? undefined : room.toJson(),
      event,
    });
  }

  emitRoom({
    description: 'user-joined',
    user: user.toJson(),
    role: role.valueOf(),
  });

  // Subscribe to add step event
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
      emitRoom({ description: 'step-added' });

      if (game.isFinished) {
        emitRoom({ description: 'game-ended' });
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
    emitRoom({
      description: 'user-set-restart',
      user: user.toJson(),
      role: role.valueOf(),
    });

    if (startGame) {
      emitRoom({ description: 'start-game' });
    } else if (resetGame) {
      emitRoom({ description: 'game-reset' });
    }
  });

  // Start game if both players joined
  if (room.canStartGame && room.game === undefined) {
    room.startGame();
    emitRoom({ description: 'start-game' });
  }

  socket.on('disconnect', () => {
    console.log('User disconnected');
    socket.removeAllListeners();

    room.onUserLeave(role, user);

    // TODO: handle temporary disconnects, and allows continue game after user disconnects for a short time
    // however should immediately end game if all users left

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
        emitRoom({ description: 'game-reset' });
      }

      emitRoom({
        description: 'user-disconnected',
        user: user.toJson(),
        role: role.valueOf(),
      });

      if (endedGame) {
        emitRoom({ description: 'game-ended' });
      }
    }
  });
});

server.listen(port, () => console.log(`Connect 5 Server started at http://localhost:${port}`));
