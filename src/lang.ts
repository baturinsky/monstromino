let lang = {
  what:`
<ol type="I">
<li>Objective is to reach the bottom of the board and get as much money as possible until you run out of turns.
<li>Each colored shape is a monster.
<li>If the monster is highlighted, it means that it's in your reach and you are powerful enough to win. Click to do it.
<li>You will expend one turn on fight and will be rewarded with some of enemy's stats and some money. 
<li>You can see enemy stats, battle projection and expected loot simply by mouse-overing it.
<li>Combat is automatic. 
<li>VIT is how many HP you start with.
You attack as often as your SPD is, deal damage to enemy HP at random between 0% and 200% of STR, minus target's DEF.
<li>Enemy does the same. 
<li>There is a draw if no one loses after 20 attacks are made. It's equivalent to your defeat in most cases.
</ol>
  `,
  what_files:`
<ol type="I">
  <li>After each your move game is saved to the AUTO slot. 
  <li>You can save in new slot, load any save or delete them with X.
</ol>  
  `,
  tip_str: `Each attack deals random damage between 0% and 200% of this value (before Defense applied).`,
  tip_vit: `Amount of HP when combat starts.`,
  tip_def: `Damage from each attack is reduced by this.`,
  tip_spd: `Frequency of attacks.`,
  tip_score: `Score is +1 per cleared cell, +100 per cleared rainbow cell, -3 per turn`,
  tip_erase: `Delete file`,
  tip_frozen: `One row of board is frozen per 3 turns.<br/>Frozen cells are completely unaccessible.`,
  tip_ability: `Not implemented yet`,
  FROZEN: `FROZEN`
};

export default lang;
