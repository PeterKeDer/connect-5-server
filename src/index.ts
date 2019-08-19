import express from 'express';
import http from 'http';
import socketio from 'socket.io';
import bodyParser from 'body-parser';
import roomController from './controllers/room_controller';
import { SocketController } from './controllers/socket_controller';

const port = 8080;

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (_, res) => {
  res.status(200).send('Connect 5 Server.');
});

app.post('/create-room', roomController.postCreateRoom);
app.post('/join-room', roomController.postJoinRoom);
app.get('/rooms', roomController.getRooms);
app.get('/rooms/:roomId', roomController.getRoomById);

const socketController = new SocketController(io);
io.on('connection', socketController.handleSocketConnection);

server.listen(port, () => console.log(`Connect 5 Server started at http://localhost:${port}`));
