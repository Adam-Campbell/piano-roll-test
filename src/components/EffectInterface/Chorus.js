import React from 'react';
import SelectInput from './SelectInput';
import RangeInput from './RangeInput';
import EffectHeader from './EffectHeader';

const Chorus = props => (
    <div className="effect__container">
        <EffectHeader 
            effectTitle={'Chorus'}
            handleClose={props.handleClose}
        />
        <div className="effect__settings-container">
            <RangeInput 
                inputId={'delay-time'}
                label={'Delay Time'}
                min={2}
                max={20}
                step={0.5}
                value={props.effectData.delayTime}
                handleChange={props.handleChange}
                effectId={props.effectId}
                propertyPathArray={['delayTime']}
            />
            <RangeInput 
                inputId={'depth'}
                label={'Depth'}
                min={0}
                max={1}
                step={0.005}
                value={props.effectData.depth}
                handleChange={props.handleChange}
                effectId={props.effectId}
                propertyPathArray={['depth']}
            />
            <RangeInput 
                inputId={'frequency'}
                label={'Frequency'}
                min={0.1}
                max={10}
                step={0.005}
                value={props.effectData.frequency}
                handleChange={props.handleChange}
                effectId={props.effectId}
                propertyPathArray={['frequency']}
            />
            <RangeInput 
                inputId={'spread'}
                label={'Spread'}
                min={0}
                max={180}
                step={1}
                value={props.effectData.spread}
                handleChange={props.handleChange}
                effectId={props.effectId}
                propertyPathArray={['spread']}
            />
            <SelectInput 
                inputId={'type'}
                label={'Type'}
                value={props.effectData.type}
                handleChange={props.handleChange}
                effectId={props.effectId}
                propertyPathArray={['type']}
                options={[
                    {value: 'sine', text: 'Sine'},
                    {value: 'square', text: 'Square'},
                    {value: 'triangle', text: 'Triangle'},
                    {value: 'sawtooth', text: 'Sawtooth'}
                ]}
            />
            <RangeInput 
                inputId={'wet'}
                label={'Wet'}
                min={0}
                max={1}
                step={0.005}
                value={props.effectData.wet}
                handleChange={props.handleChange}
                effectId={props.effectId}
                propertyPathArray={['wet']}
            />
        </div>
    </div>
);

export default Chorus;