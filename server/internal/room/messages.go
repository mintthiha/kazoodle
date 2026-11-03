package room

import "github.com/mintthiha/party-games/server/internal/protocol"

// These builders keep the verbose generated-struct literals out of run's
// dispatch code. Each returns a ready-to-send ServerMessage.

func msgPlayerJoined(p Player) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_PlayerJoined{
			PlayerJoined: &protocol.PlayerJoined{Player: p.wire()},
		},
	}
}

func msgPlayerPresence(playerID string, connected bool) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_PlayerPresence{
			PlayerPresence: &protocol.PlayerPresence{PlayerId: playerID, Connected: connected},
		},
	}
}

// msgResumed is the RoomJoined that answers a ResumeRoom. gameID and events are
// empty unless the player has a seat in a running game.
func msgResumed(code string, m *member, roster []Player, hostID, gameID string, events, offline []string) *protocol.ServerMessage {
	players := make([]*protocol.Player, 0, len(roster))
	for _, p := range roster {
		players = append(players, p.wire())
	}
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_RoomJoined{
			RoomJoined: &protocol.RoomJoined{
				RoomCode:         code,
				SelfPlayerId:     m.player.ID,
				Players:          players,
				HostId:           hostID,
				SessionToken:     m.token,
				Resumed:          true,
				ActiveGameId:     gameID,
				GameEvents:       events,
				OfflinePlayerIds: offline,
			},
		},
	}
}

func msgError(code, detail string) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_Error{
			Error: &protocol.ErrorInfo{Code: code, Message: detail},
		},
	}
}

func msgPlayerLeft(playerID string) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_PlayerLeft{
			PlayerLeft: &protocol.PlayerLeft{PlayerId: playerID},
		},
	}
}

func msgEchoResult(text, fromPlayerID string) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_EchoResult{
			EchoResult: &protocol.EchoResult{Text: text, FromPlayerId: fromPlayerID},
		},
	}
}

func msgHostChanged(hostID string) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_HostChanged{
			HostChanged: &protocol.HostChanged{HostId: hostID},
		},
	}
}

func msgGameStarted(gameID string) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_GameStarted{
			GameStarted: &protocol.GameStarted{GameId: gameID},
		},
	}
}

func msgGameEnded(gameID, reason string) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_GameEnded{
			GameEnded: &protocol.GameEnded{GameId: gameID, Reason: reason},
		},
	}
}

func msgGameOptionsChanged(gameID string, options []byte) *protocol.ServerMessage {
	return &protocol.ServerMessage{
		Payload: &protocol.ServerMessage_GameOptionsChanged{
			GameOptionsChanged: &protocol.GameOptionsChanged{GameId: gameID, Options: string(options)},
		},
	}
}
