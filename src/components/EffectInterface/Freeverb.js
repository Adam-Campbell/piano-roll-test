import React from 'react';
import PropTypes from 'prop-types';
import EnhancedRangeInput from '../EnhancedRangeInput';
import EffectHeader from './EffectHeader';
import Dial from '../Dial';
import SmallDial from '../SmallDial';

const Freeverb = props => (
    <div className="effect__container">
        <EffectHeader 
            effectTitle={'Freeverb'}
        />
        <div className="effect__settings-container">
            <div className="effect__dial-row">
                <Dial
                    dataMin={40}
                    dataMax={16000}
                    stepSize={5}
                    snapToSteps={true}
                    value={props.effectData.dampening}
                    dialStartOffset={225}
                    dialRange={270}
                    updateValueCallback={(newVal) => props.handleChange(
                        props.effectId,
                        ['dampening'],
                        newVal
                    )}
                >
                    {(props) => <SmallDial {...props} label="Dampening" />}
                </Dial>
                <Dial
                    dataMin={0}
                    dataMax={1}
                    stepSize={0.005}
                    snapToSteps={true}
                    value={props.effectData.roomSize}
                    dialStartOffset={225}
                    dialRange={270}
                    updateValueCallback={(newVal) => props.handleChange(
                        props.effectId,
                        ['roomSize'],
                        newVal
                    )}
                >
                    {(props) => <SmallDial {...props} label="Room Size" />}
                </Dial>
                <Dial
                    dataMin={0}
                    dataMax={1}
                    stepSize={0.005}
                    snapToSteps={true}
                    value={props.effectData.wet}
                    dialStartOffset={225}
                    dialRange={270}
                    updateValueCallback={(newVal) => props.handleChange(
                        props.effectId,
                        ['wet'],
                        newVal
                    )}
                >
                    {(props) => <SmallDial {...props} label="Wet" />}
                </Dial>
            </div>
        </div>
    </div>
); 

Freeverb.propTypes = {
    effectData: PropTypes.object.isRequired,
    effectId: PropTypes.string.isRequired,
    handleChange: PropTypes.func.isRequired
};

export default Freeverb;
