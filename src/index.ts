import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import bodyParser from 'body-parser';
import { GameRoomSettings } from './models/game_room_settings';
import { GameRoom, gameRoomRoleFrom, GameRoomRole } from './models/game_room';
import { Point, Side } from './models/game';
import { User } from './models/user';

const port = 8080;

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const rooms: GameRoom[] = [
  new GameRoom('ok', new GameRoomSettings())
];

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
app.post('/create-room', (req, res, next) => {
  const settings = GameRoomSettings.fromJson(req.body.settings);

  // TODO: also send back error
  if (settings === undefined) {
    res.sendStatus(400);
    return;
  }

  const roomId = req.body.id;

  if (typeof roomId !== 'string') {
    res.sendStatus(400);
    return;
  }

  if (rooms.find(room => room.id === roomId)) {
    // Room id taken
    res.sendStatus(400);
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
    rooms: rooms
      .filter((room) => room.settings.isPublic)
      .map(room => room.toJson()),
  });
});

// TODO: maybe condense most events into one - roomUpdated, with field lastAction to indicate what happened
const Events = {
  connection: 'connection',
  failToJoin: 'fail-to-join',
  userJoined: 'user-joined',
  userDisconnected: 'user-disconnected',
  startGame: 'start-game',
  stepAdded: 'step-added',
  failToAddStep: 'fail-to-add-step',
};

const UserEvents = {
  addStep: 'add-step',
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
io.on('connection', socket => {
  console.log('User connected');
  // TODO: if game in progress, then make user remain in lobby until the game finishes
  const query = socket.handshake.query;
  const roomId = query.roomId;
  const role = gameRoomRoleFrom(Number.parseInt(query.role));

  // If nickname is undefined, display as 'Guest'
  let nickname: string | undefined = query.nickname;

  if (typeof nickname !== 'string' || nickname.trim().length === 0) {
    nickname = undefined;
  }

  const user = new User(socket.id, nickname);

  // TODO: reject with reason
  function reject() {
    socket.emit(Events.failToJoin);
    socket.disconnect();
  }

  // Check if parameters are valid
  if (role === undefined) {
    console.log('Invalid role');
    reject();
    return;
  }

  if (typeof roomId !== 'string') {
    console.log('Invalid roomId');
    reject();
    return;
  }

  // Get room with roomId
  const room = rooms.find(room => room.id === roomId);

  if (room === undefined) {
    console.log('Room does not exist');
    reject();
    return;
  }

  if (!room.onUserJoin(role, user)) {
    // Cannot join room with role
    console.log('Cannot join with role');
    reject();
    return;
  }

  // If a spectator joins mid game, send game info
  if (role === GameRoomRole.Spectator && room.gameInProgress) {
    socket.emit(Events.startGame, {
      room: room.toJson(),
    });
  }

  // Join room success
  console.log('Join room successfully');
  socket.join(roomId);

  const roomSocket = io.to(roomId);

  roomSocket.emit(Events.userJoined, {
    user: user.toJson(),
    room: room.toJson(),
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

        // TODO: handle rematch event, quit, etc.
      }

      // Add step success
      roomSocket.emit(Events.stepAdded, {
        point: point.toJson(),
        side: side.valueOf(),
        room: room.toJson(),
      });
    }
  });

  // Start game if both players joined
  if (room.canStartGame) {
    room.startGame();
    roomSocket.emit(Events.startGame, {
      room: room.toJson(),
    });
  }

  socket.on('disconnect', () => {
    console.log('User disconnected');
    socket.removeAllListeners();

    room.onUserLeave(role, user);

    if (room.isEmpty) {
      // Room is empty, can delete
      rooms.splice(rooms.indexOf(room));

    } else {
      // End game if one of the players left
      if (room.gameInProgress && role !== GameRoomRole.Spectator) {
        room.endGame();
      }

      roomSocket.emit(Events.userDisconnected, {
        user: user.toJson(),
        room: room.toJson(),
      });
    }
  });
});

server.listen(port, () => console.log(`Connect 5 Server started at http://localhost:${port}`));
