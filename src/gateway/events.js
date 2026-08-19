/**
 * Constantes de eventos do Gateway Osmium
 */
export const Events = {
  // Eventos de Ciclo de Vida do Cliente
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  READY: 'ready',
  ERROR: 'error',

  // Eventos de Atualizações em Tempo Real (Updates)
  MESSAGE_CREATED: 'messageCreated',
  MESSAGE_UPDATED: 'messageUpdated',
  MESSAGE_DELETED: 'messageDeleted',
  MESSAGE_REACTIONS: 'messageReactions',
  USER_STATUS: 'userStatus',
  USER_UPDATED: 'userUpdated',
  COMMUNITY_UPDATED: 'communityUpdated',
  COMMUNITY_DELETED: 'communityDeleted',
  COMMUNITY_MEMBER_CREATED: 'communityMemberCreated',
  COMMUNITY_MEMBER_UPDATED: 'communityMemberUpdated',
  COMMUNITY_MEMBER_DELETED: 'communityMemberDeleted',
  CHANNEL_UPDATED: 'channelUpdated',
  CHANNEL_DELETED: 'channelDeleted',
  CHAT_TYPING: 'chatTyping',
  CHAT_UPDATED: 'chatUpdated',
  ROOM_STATE: 'roomState',
  ROOM_PARTICIPANT: 'roomParticipant'
};
