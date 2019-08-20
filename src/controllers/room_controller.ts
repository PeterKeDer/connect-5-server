import { Request, Response } from 'express';
import { GameRoomSettings, GameRoomSettingsError } from '../models/game_room_settings';
import { RoomManager } from '../helpers/room_manager';
import { UserManager } from '../helpers/user_manager';
import { gameRoomRoleFrom, GameRoom } from '../models/game_room';
import { User } from '../models/user';
import uuidv1 from 'uuid/v1';

type CreateRoomError = GameRoomSettingsError | 'invalid_room_id' | 'room_id_taken' | 'invalid_role';

function postCreateRoom(req: Request, res: Response) {
  function fail(error: CreateRoomError) {
    res.status(400).send({ error });
  }

  const settings = GameRoomSettings.fromJson(req.body.settings);
  const roomId = req.body.id;
  const role = gameRoomRoleFrom(req.body.role);

  let nickname: string | undefined = req.body.nickname;

  if (typeof nickname !== 'string') {
    nickname = undefined;
  }

  if (!(settings instanceof GameRoomSettings)) {
    return fail(settings);
  }

  if (typeof roomId !== 'string' || roomId.trim().length == 0) {
    return fail('invalid_room_id');
  }

  if (role === undefined) {
    return fail('invalid_role');
  }

  if (RoomManager.shared.findRoomById(roomId) !== undefined) {
    return fail('room_id_taken');
  }

  const userId = uuidv1();
  const user = new User(userId, nickname, false);
  const room = new GameRoom(roomId, settings);

  if (!room.onUserJoin(role, user)) {
    return fail('invalid_role');
  }

  RoomManager.shared.addRoom(room);
  UserManager.shared.addPendingUser(user, room, role, () => room.onUserLeave(role, user));

  res.status(200).send({ userId });
}

type JoinRoomError = 'invalid_role' | 'invalid_room_id';

function postJoinRoom(req: Request, res: Response) {
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
    return fail('invalid_room_id');
  }

  if (role === undefined) {
    return fail('invalid_role');
  }

  const room = RoomManager.shared.findRoomById(roomId);

  if (room === undefined) {
    return fail('invalid_room_id');
  }

  const userId = uuidv1();
  const user = new User(userId, nickname, false);

  if (!room.onUserJoin(role, user)) {
    return fail('invalid_role');
  }

  UserManager.shared.addPendingUser(user, room, role, () => room.onUserLeave(role, user));

  res.status(200).send({ userId });
}

function getRooms(_: Request, res: Response) {
  res.status(200).send({
    rooms: RoomManager.shared.getPublicRooms().map(room => room.toJson()),
  });
}

type GetRoomError = 'invalid_room_id' | 'room_not_found';

function getRoomById(req: Request, res: Response) {
  function fail(error: GetRoomError) {
    res.status(400).send({ error });
  }

  const roomId = req.params.roomId;

  if (typeof roomId !== 'string') {
    return fail('invalid_room_id');
  }

  const room = RoomManager.shared.findRoomById(roomId);

  if (room === undefined) {
    return fail('room_not_found');
  }

  res.status(200).send({
    room: room.toJson(),
  });
}

export default {
  postCreateRoom,
  postJoinRoom,
  getRooms,
  getRoomById,
};
