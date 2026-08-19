import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import { ClientMessageSchema, ServerMessageSchema } from '../gen/core_pb.js';

/**
 * Codifica um ClientMessage para Uint8Array.
 * @param {object} messageData Objeto com `id` e a RPC a invocar em `message`
 * @returns {Uint8Array}
 */
export function encodeClientMessage(messageData) {
  const msg = create(ClientMessageSchema, messageData);
  return toBinary(ClientMessageSchema, msg);
}

/**
 * Decodifica um buffer ou Uint8Array para ServerMessage.
 * @param {Uint8Array|Buffer|ArrayBuffer} binaryData
 * @returns {import('@bufbuild/protobuf').MessageShape<typeof ServerMessageSchema>}
 */
export function decodeServerMessage(binaryData) {
  const bytes = binaryData instanceof Uint8Array 
    ? binaryData 
    : new Uint8Array(binaryData);
  return fromBinary(ServerMessageSchema, bytes);
}
