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
