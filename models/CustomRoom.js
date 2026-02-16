const mongoose = require('mongoose');

// Player slot schema
const slotSchema = new mongoose.Schema({
    slotNumber: { type: Number, required: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    socketId: { type: String, default: null },
    username: { type: String, default: null },
    isLocked: { type: Boolean, default: false }
}, { _id: false });

// Team schema
const teamSchema = new mongoose.Schema({
    teamNumber: { type: Number, required: true },
    slots: [slotSchema]
}, { _id: false });

// Administrator slot schema
const adminSlotSchema = new mongoose.Schema({
    slotNumber: { type: Number, required: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    socketId: { type: String, default: null },
    username: { type: String, default: null }
}, { _id: false });

const customRoomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    roomCode: {
        type: String,
        required: true,
        unique: true,
        index: true,
        uppercase: true,
        minlength: 6,
        maxlength: 6
    },
    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    hostSocketId: {
        type: String,
        required: true
    },
    maxTeams: {
        type: Number,
        default: 10,
        min: 2,
        max: 20
    },
    maxPlayersPerTeam: {
        type: Number,
        default: 5,
        min: 1,
        max: 10
    },
    administrators: [adminSlotSchema],
    roomStatus: {
        type: String,
        enum: ['waiting', 'started', 'ended'],
        default: 'waiting',
        index: true
    },
    teams: [teamSchema],
    settings: {
        map: {
            type: String,
            default: 'default'
        },
        region: {
            type: String,
            default: 'auto'
        },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            default: 'medium'
        }
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    startedAt: {
        type: Date,
        default: null
    },
    endedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: function () {
            return new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
        },
        index: true
    }
});

// Virtual for total players count
customRoomSchema.virtual('totalPlayers').get(function () {
    return this.teams.reduce((total, team) => {
        return total + team.slots.filter(slot => slot.playerId !== null).length;
    }, 0);
});

// Initialize teams and slots when room is created
customRoomSchema.methods.initializeTeams = function () {
    this.teams = [];
    for (let i = 1; i <= this.maxTeams; i++) {
        const slots = [];
        for (let j = 1; j <= this.maxPlayersPerTeam; j++) {
            slots.push({
                slotNumber: j,
                playerId: null,
                socketId: null,
                username: null,
                isLocked: false
            });
        }
        this.teams.push({
            teamNumber: i,
            slots
        });
    }
};

// Find first available slot
customRoomSchema.methods.findAvailableSlot = function () {
    for (const team of this.teams) {
        for (const slot of team.slots) {
            if (!slot.playerId && !slot.isLocked) {
                return { teamNumber: team.teamNumber, slotNumber: slot.slotNumber };
            }
        }
    }
    return null;
};

// Assign player to slot
customRoomSchema.methods.assignPlayerToSlot = function (teamNumber, slotNumber, playerId, socketId, username) {
    const team = this.teams.find(t => t.teamNumber === teamNumber);
    if (!team) return false;

    const slot = team.slots.find(s => s.slotNumber === slotNumber);
    if (!slot || slot.playerId || slot.isLocked) return false;

    slot.playerId = playerId;
    slot.socketId = socketId;
    slot.username = username;
    return true;
};

// Remove player from room
customRoomSchema.methods.removePlayer = function (playerId) {
    for (const team of this.teams) {
        for (const slot of team.slots) {
            if (slot.playerId && slot.playerId.toString() === playerId.toString()) {
                slot.playerId = null;
                slot.socketId = null;
                slot.username = null;
                return { teamNumber: team.teamNumber, slotNumber: slot.slotNumber };
            }
        }
    }
    return null;
};

// Remove player by socket ID
customRoomSchema.methods.removePlayerBySocketId = function (socketId) {
    for (const team of this.teams) {
        for (const slot of team.slots) {
            if (slot.socketId === socketId) {
                const playerId = slot.playerId;
                slot.playerId = null;
                slot.socketId = null;
                slot.username = null;
                return { playerId, teamNumber: team.teamNumber, slotNumber: slot.slotNumber };
            }
        }
    }
    return null;
};

// Get player's current slot
customRoomSchema.methods.getPlayerSlot = function (playerId) {
    for (const team of this.teams) {
        for (const slot of team.slots) {
            if (slot.playerId && slot.playerId.toString() === playerId.toString()) {
                return { teamNumber: team.teamNumber, slotNumber: slot.slotNumber };
            }
        }
    }
    return null;
};

// Check if room is full
customRoomSchema.methods.isFull = function () {
    return this.totalPlayers >= this.maxTeams * this.maxPlayersPerTeam;
};

// Initialize administrator slots
customRoomSchema.methods.initializeAdministrators = function () {
    this.administrators = [];
    for (let i = 1; i <= 5; i++) {
        this.administrators.push({
            slotNumber: i,
            adminId: null,
            socketId: null,
            username: null
        });
    }
};

// Assign administrator to slot
customRoomSchema.methods.assignAdministrator = function (slotNumber, adminId, socketId, username) {
    const slot = this.administrators.find(s => s.slotNumber === slotNumber);
    if (!slot || slot.adminId) return false;

    slot.adminId = adminId;
    slot.socketId = socketId;
    slot.username = username;
    return true;
};

// Remove administrator
customRoomSchema.methods.removeAdministrator = function (adminId) {
    const slot = this.administrators.find(s => s.adminId && s.adminId.toString() === adminId.toString());
    if (!slot) return null;

    slot.adminId = null;
    slot.socketId = null;
    slot.username = null;
    return slot.slotNumber;
};

// Find available admin slot
customRoomSchema.methods.findAvailableAdminSlot = function () {
    const slot = this.administrators.find(s => !s.adminId);
    return slot ? slot.slotNumber : null;
};

// Ensure virtuals are included in JSON
customRoomSchema.set('toJSON', { virtuals: true });
customRoomSchema.set('toObject', { virtuals: true });

const CustomRoom = mongoose.model('CustomRoom', customRoomSchema);

module.exports = CustomRoom;
