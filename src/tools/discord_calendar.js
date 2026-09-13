/*
** caminho: tools/discord_calendar.js
** últimaMod: 2026-02-01
** autor: Vico
** colaboração: Gemini
*/

const { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } = require('discord.js');

/**
 * Handler for managing Discord Scheduled Events (Calendar)
 * Supports listing and creating events.
 * 
 * @param {Object} args - Tool arguments
 * @param {string} args.action - Action to perform: 'list' or 'create'
 * @param {string} [args.name] - Event name (for 'create')
 * @param {string} [args.description] - Event description (for 'create')
 * @param {string} [args.start_time] - Start time (ISO string)
 * @param {string} [args.end_time] - End time (ISO string)
 * @param {string} [args.type] - Event type: 'voice', 'stage', 'external' (default: 'external')
 * @param {string} [args.location] - Location (for 'external') or Channel ID (for 'voice'/'stage')
 * @param {Object} context - Injected context (client, guildId)
 */
async function execute(args, context) {
  const { action, name, description, start_time, end_time, type = 'external', location } = args;
  const { client, guildId } = context;

  if (!client || !guildId) {
    throw new Error('Invalid context: client or guildId not provided.');
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Guild ${guildId} not found in cache.`);
  }

  // 1. List events
  if (action === 'list') {
    try {
      // Fetch events (update cache)
      const events = await guild.scheduledEvents.fetch();
      
      if (events.size === 0) {
        return 'There are no scheduled events for this server.';
      }

      // Format events for display
      const formattedEvents = events.map(event => {
        // Keep pt-BR locale for formatting dates as the users are likely Portuguese speakers
        const start = event.scheduledStartAt ? event.scheduledStartAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
        const end = event.scheduledEndAt ? event.scheduledEndAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
        const status = event.status; // SCHEDULED, ACTIVE, COMPLETED, CANCELED
        
        let localInfo = '';
        if (event.entityType === GuildScheduledEventEntityType.External) {
          localInfo = `Location: ${event.entityMetadata?.location || 'External'}`;
        } else {
          const channel = guild.channels.cache.get(event.channelId);
          localInfo = `Channel: ${channel ? channel.name : event.channelId}`;
        }

        return `- **${event.name}**\n  Description: ${event.description || 'No description'}\n  Start: ${start}\n  End: ${end}\n  ${localInfo}\n  Status: ${status}\n  Attendees: ${event.userCount || 0}`;
      }).join('\n\n');

      return `📅 **Scheduled Events:**\n\n${formattedEvents}`;
    } catch (error) {
      console.error('[TOOLS][CALENDAR] Error listing events:', error);
      throw new Error(`Error listing events: ${error.message}`);
    }
  }

  // 2. Create event
  if (action === 'create') {
    if (!name || !start_time || !end_time) {
      throw new Error("To create an event, 'name', 'start_time', and 'end_time' are required.");
    }

    try {
      const scheduledStartTime = new Date(start_time);
      const scheduledEndTime = new Date(end_time);

      if (isNaN(scheduledStartTime.getTime()) || isNaN(scheduledEndTime.getTime())) {
        throw new Error('Invalid dates provided.');
      }

      let entityType;
      let channel = null;
      let entityMetadata = null;

      // Map type
      if (type.toLowerCase() === 'voice') {
        entityType = GuildScheduledEventEntityType.Voice;
        if (!location) throw new Error("For voice events, 'location' must be the voice channel ID.");
        channel = location;
      } else if (type.toLowerCase() === 'stage') {
        entityType = GuildScheduledEventEntityType.StageInstance;
        if (!location) throw new Error("For stage events, 'location' must be the stage channel ID.");
        channel = location;
      } else {
        // External (default)
        entityType = GuildScheduledEventEntityType.External;
        if (!location) throw new Error("For external events, 'location' must be the address or link.");
        entityMetadata = { location: location };
      }

      const eventData = {
        name,
        scheduledStartTime,
        scheduledEndTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType,
        description: description || '',
      };

      if (channel) eventData.channel = channel;
      if (entityMetadata) eventData.entityMetadata = entityMetadata;

      const event = await guild.scheduledEvents.create(eventData);

      return `✅ Event created successfully!\n**${event.name}**\nLink: ${event.url}`;

    } catch (error) {
      console.error('[TOOLS][CALENDAR] Error creating event:', error);
      throw new Error(`Error creating event: ${error.message}`);
    }
  }

  throw new Error(`Action '${action}' not recognized. Use 'list' or 'create'.`);
}

module.exports = {
  execute
};