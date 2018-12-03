import * as actionTypes from '../actionTypes';

const defaultState = {
    isPlaying: false,
    isMuted: false,
    volume: 0
};

const playerInfo = (state=defaultState, action) => {
    switch (action.type) {

        case actionTypes.PLAY_TRACK:
            return {
                ...state,
                isPlaying: true
            };

        case actionTypes.STOP_TRACK:
            return {
                ...state, 
                isPlaying: false
            };

        case actionTypes.MUTE_MASTER:
            return {
                ...state, 
                isMuted: true
            };

        case actionTypes.UNMUTE_MASTER:
            return {
                ...state,
                isMuted: false
            };

        case actionTypes.SET_MASTER_VOLUME:
            return {
                ...state,
                volume: action.payload.volume
            };

        default:
            return state;

    }
}

export default playerInfo;