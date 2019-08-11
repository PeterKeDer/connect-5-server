import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import bodyParser from 'body-parser';
import { GameRoomSettings, GameRoomSettingsObject } from './models/game_room_settings';
import { GameRoom, gameRoomRoleFrom } from './models/game_room';

const port = 8080;

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const rooms: GameRoom[] = [];

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

  const roomId = req.body.roomId;

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
    rooms: rooms.map(room => room.toJson()),
  });
});

const Events = {
  connection: 'connection',
  failToJoin: 'fail-to-join',
  userJoined: 'user-joined',
  userDisconnected: 'user-disconnected',
  disconnect: 'disconnect',
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

  const userId = socket.id;

  const query = socket.handshake.query;
  const roomId = query.roomId;
  const role = gameRoomRoleFrom(query.role);

  // If nickname is undefined, display as 'Guest'
  let nickname: string | undefined = query.nickname;

  if (typeof nickname !== 'string' || nickname.trim.length === 0) {
    nickname = undefined;
  }

  // TODO: reject with reason
  function reject() {
    socket.send(Events.failToJoin);
    socket.disconnect();
  }

  // Check if parameters are valid
  if (role === undefined) {
    reject();
    return;
  }

  if (typeof roomId !== 'string') {
    reject();
    return;
  }

  // Get room with roomId
  const room = rooms.find(room => room.id === roomId);

  if (room === undefined) {
    reject();
    return;
  }

  if (!room.onUserJoin(role, userId)) {
    // Cannot join room with role
    reject();
    return;
  }

  // Join room success
  socket.join(roomId);

  const roomSocket = io.to(roomId);

  roomSocket.emit(Events.userJoined, {
    userId,
    nickname,
    room: room.toJson(),
  });

  // TODO: start game at room if necessary

  socket.on(Events.disconnect, () => {
    console.log('User disconnected');

    room.onUserLeave(role, userId);

    // TODO: handle other stuffs like ending game if necessary

    roomSocket.emit(Events.userDisconnected, {
      userId,
      room: room.toJson(),
    });
  });
});

server.listen(port, () => console.log(`Connect 5 Server started at http://localhost:${port}`));
