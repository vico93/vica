import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';
import { Events } from './events.js';

export class GatewayDispatcher extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Despacha um ServerMessage recebido para o respectivo evento.
   * @param {import('../gen/core_pb.js').ServerMessage} serverMessage
   */
  dispatch(serverMessage) {
    if (!serverMessage || !serverMessage.message) return;

    if (serverMessage.message.case === 'update') {
      const updateWrapper = serverMessage.message.value;
      const updateCase = updateWrapper?.update?.case;
      const updateValue = updateWrapper?.update?.value;

      if (!updateCase) return;

      switch (updateCase) {
        case 'messageCreated':
          this.emit(Events.MESSAGE_CREATED, updateValue);
          break;
        case 'message':
          this.emit(Events.MESSAGE_UPDATED, updateValue);
          break;
        case 'messageDeleted':
          this.emit(Events.MESSAGE_DELETED, updateValue);
          break;
        case 'messageReactions':
          this.emit(Events.MESSAGE_REACTIONS, updateValue);
          break;
        case 'userStatus':
          this.emit(Events.USER_STATUS, updateValue);
          break;
        case 'user':
          this.emit(Events.USER_UPDATED, updateValue);
          break;
        case 'community':
          this.emit(Events.COMMUNITY_UPDATED, updateValue);
          break;
        case 'communityDeleted':
          this.emit(Events.COMMUNITY_DELETED, updateValue);
          break;
        case 'communityMemberCreated':
          this.emit(Events.COMMUNITY_MEMBER_CREATED, updateValue);
          break;
        case 'communityMember':
          this.emit(Events.COMMUNITY_MEMBER_UPDATED, updateValue);
          break;
        case 'communityMemberDeleted':
          this.emit(Events.COMMUNITY_MEMBER_DELETED, updateValue);
          break;
        case 'channel':
          this.emit(Events.CHANNEL_UPDATED, updateValue);
          break;
        case 'channelDeleted':
          this.emit(Events.CHANNEL_DELETED, updateValue);
          break;
        case 'chatTyping':
          this.emit(Events.CHAT_TYPING, updateValue);
          break;
        case 'chat':
          this.emit(Events.CHAT_UPDATED, updateValue);
          break;
        case 'roomState':
          this.emit(Events.ROOM_STATE, updateValue);
          break;
        case 'roomParticipant':
          this.emit(Events.ROOM_PARTICIPANT, updateValue);
          break;
        default:
          logger.debug(`Update não mapeado recebido: ${updateCase}`);
          this.emit('unhandledUpdate', { case: updateCase, value: updateValue });
          break;
      }
    }
  }
}
