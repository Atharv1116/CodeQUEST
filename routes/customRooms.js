const express = require('express');
const router = express.Router();
const CustomRoom = require('../models/CustomRoom');
const authenticateToken = require('../middleware/authenticateToken');
const { generateUniqueRoomCode } = require('../utils/roomCodeGenerator');

// Create new custom room
router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { maxTeams = 10, maxPlayersPerTeam = 5, settings = {} } = req.body;
        const userId = req.userId;

        // Generate unique room code
        const roomCode = await generateUniqueRoomCode(async (code) => {
            const existing = await CustomRoom.findOne({ roomCode: code });
            return !!existing;
        });

        // Generate unique room ID
        const roomId = `custom_br_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

        // Create room
        const room = new CustomRoom({
            roomId,
            roomCode,
            hostId: userId,
            hostSocketId: req.body.socketId || '', // Will be set via socket
            maxTeams,
            maxPlayersPerTeam,
            settings: {
                map: settings.map || 'default',
                region: settings.region || 'auto',
                difficulty: settings.difficulty || 'medium'
            }
        });

        // Initialize teams, slots, and administrators
        room.initializeTeams();
        room.initializeAdministrators();

        await room.save();

        console.log(`[CustomRoom] Created room ${roomCode} (${roomId}) by user ${userId}`);

        res.json({
            ok: true,
            room: {
                roomId: room.roomId,
                roomCode: room.roomCode,
                hostId: room.hostId,
                maxTeams: room.maxTeams,
                maxPlayersPerTeam: room.maxPlayersPerTeam,
                roomStatus: room.roomStatus,
                settings: room.settings
            }
        });
    } catch (error) {
        console.error('[CustomRoom] Error creating room:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Join room by code
router.post('/join', authenticateToken, async (req, res) => {
    try {
        const { roomCode } = req.body;
        const userId = req.userId;

        if (!roomCode || roomCode.length !== 6) {
            return res.status(400).json({ ok: false, error: 'Invalid room code format' });
        }

        const room = await CustomRoom.findOne({ roomCode: roomCode.toUpperCase() });

        if (!room) {
            return res.status(404).json({ ok: false, error: 'Room not found' });
        }

        if (room.roomStatus !== 'waiting') {
            return res.status(400).json({ ok: false, error: 'Room has already started or ended' });
        }

        if (room.isFull()) {
            return res.status(400).json({ ok: false, error: 'Room is full' });
        }

        // Check if room has expired
        if (new Date() > room.expiresAt) {
            room.roomStatus = 'ended';
            await room.save();
            return res.status(400).json({ ok: false, error: 'Room has expired' });
        }

        res.json({
            ok: true,
            room: {
                roomId: room.roomId,
                roomCode: room.roomCode,
                hostId: room.hostId,
                maxTeams: room.maxTeams,
                maxPlayersPerTeam: room.maxPlayersPerTeam,
                roomStatus: room.roomStatus,
                totalPlayers: room.totalPlayers,
                settings: room.settings
            }
        });
    } catch (error) {
        console.error('[CustomRoom] Error joining room:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get room details
router.get('/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;

        const room = await CustomRoom.findOne({ roomId }).populate('hostId', 'username');

        if (!room) {
            return res.status(404).json({ ok: false, error: 'Room not found' });
        }

        res.json({
            ok: true,
            room: {
                roomId: room.roomId,
                roomCode: room.roomCode,
                hostId: room.hostId,
                maxTeams: room.maxTeams,
                maxPlayersPerTeam: room.maxPlayersPerTeam,
                roomStatus: room.roomStatus,
                totalPlayers: room.totalPlayers,
                teams: room.teams,
                administrators: room.administrators,
                settings: room.settings,
                createdAt: room.createdAt,
                expiresAt: room.expiresAt
            }
        });
    } catch (error) {
        console.error('[CustomRoom] Error getting room:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Leave room
router.post('/:roomId/leave', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.userId;

        const room = await CustomRoom.findOne({ roomId });

        if (!room) {
            return res.status(404).json({ ok: false, error: 'Room not found' });
        }

        const removed = room.removePlayer(userId);

        if (!removed) {
            return res.status(400).json({ ok: false, error: 'Player not in room' });
        }

        await room.save();

        console.log(`[CustomRoom] User ${userId} left room ${roomCode}`);

        res.json({ ok: true, message: 'Left room successfully' });
    } catch (error) {
        console.error('[CustomRoom] Error leaving room:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Start match (host only)
router.post('/:roomId/start', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.userId;

        const room = await CustomRoom.findOne({ roomId });

        if (!room) {
            return res.status(404).json({ ok: false, error: 'Room not found' });
        }

        if (room.hostId.toString() !== userId.toString()) {
            return res.status(403).json({ ok: false, error: 'Only host can start the match' });
        }

        if (room.roomStatus !== 'waiting') {
            return res.status(400).json({ ok: false, error: 'Room has already started or ended' });
        }

        // No minimum player requirement - host can start with any number
        room.roomStatus = 'started';
        room.startedAt = new Date();
        await room.save();

        console.log(`[CustomRoom] Room ${room.roomCode} started by host ${userId}`);

        res.json({ ok: true, message: 'Match started successfully' });
    } catch (error) {
        console.error('[CustomRoom] Error starting match:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
