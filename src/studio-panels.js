// Desktop preferences survive preview and small-screen drawers.
export class StudioPanels {
  constructor(mobile=false){this.mobile=mobile;this.mode='teacher';this.desktop={slides:true,properties:true};this.previewSlides=false;this.drawer=null;}
  setMobile(mobile){this.mobile=mobile;this.drawer=null;}
  setMode(mode){if(mode===this.mode)return;this.mode=mode;this.drawer=null;if(mode==='preview')this.previewSlides=false;}
  visible(panel){if(this.mode==='present'||this.mode==='preview'&&panel==='properties')return false;return this.mobile?this.drawer===panel:this.mode==='preview'?this.previewSlides:this.desktop[panel];}
  setPanel(panel,visible){
    if(this.mode==='present'||this.mode==='preview'&&panel==='properties')return;
    if(this.mobile)this.drawer=visible?panel:this.drawer===panel?null:this.drawer;
    else if(this.mode==='preview')this.previewSlides=visible;
    else this.desktop[panel]=visible;
  }
  toggle(panel){this.setPanel(panel,!this.visible(panel));}
  closeDrawer(){this.drawer=null;}
}
