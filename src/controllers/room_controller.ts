import { Request, Response } from 'express';
import { GameRoomSettings, GameRoomSettingsError } from '../models/game_room_settings';
import { RoomManager } from '../helpers/room_manager';
import { UserManager } from '../helpers/user_manager';
import { gameRoomRoleFrom } from '../models/game_room';
import { User } from '../models/user';
import uuidv1 from 'uuid/v1';

type CreateRoomError = GameRoomSettingsError | 'invalid_room_id' | 'room_id_taken';

function postCreateRoom(req: Request, res: Response) {
  // TODO: add join-room login into here so client only needs to call create-room instead of create-room then join-room

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

  if (RoomManager.shared.findRoomById(roomId) !== undefined) {
    fail('room_id_taken');
    return;
  }

  const room = RoomManager.shared.createRoom(roomId, settings);

  res.status(200).send({
    room: room.toJson(),
  });
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
    fail('invalid_room_id');
    return;
  }

  if (role === undefined) {
    fail('invalid_role');
    return;
  }

  const room = RoomManager.shared.findRoomById(roomId);

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
  const roomId = req.params.roomId;

  function fail(error: GetRoomError) {
    res.status(400).send({ error });
  }

  if (typeof roomId !== 'string') {
    fail('invalid_room_id');
    return;
  }

  const room = RoomManager.shared.findRoomById(roomId);

  if (room === undefined) {
    fail('room_not_found');
    return;
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
