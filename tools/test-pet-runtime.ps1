$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot
$probeDir=Join-Path $env:TEMP ('deskland-pet-qa-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeDir | Out-Null
$child=New-Object Diagnostics.Process
$child.StartInfo=New-Object Diagnostics.ProcessStartInfo
$child.StartInfo.FileName=Join-Path $repoRoot 'third_party\KuroCat\src-tauri\target\release\DesklandPet.exe'
$child.StartInfo.Arguments='--deskland '+$PID
$child.StartInfo.UseShellExecute=$false
$child.StartInfo.CreateNoWindow=$true
$child.StartInfo.RedirectStandardInput=$true
$child.StartInfo.RedirectStandardOutput=$true
$child.StartInfo.RedirectStandardError=$true
$child.StartInfo.EnvironmentVariables['LOCALAPPDATA']=$probeDir
$child.StartInfo.EnvironmentVariables['APPDATA']=$probeDir
$child.StartInfo.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER']=Join-Path $probeDir 'WebView2'
$child.StartInfo.EnvironmentVariables['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']='--remote-debugging-port=9235'
Add-Type -TypeDefinition @'
using System.Diagnostics;
using System.Collections.Concurrent;
public static class PetProbeOutput {
    static readonly ConcurrentQueue<string> lines=new ConcurrentQueue<string>();
    public static void Attach(Process child) {
        child.OutputDataReceived+=(s,e)=>{if(e.Data!=null)lines.Enqueue(e.Data);};
        child.BeginOutputReadLine();
    }
    public static string Next(){string line;return lines.TryDequeue(out line)?line:null;}
}
'@
function Send-Pet($message){$child.StandardInput.WriteLine(($message | ConvertTo-Json -Compress -Depth 30))}
function Read-Pet($type){
    $watch=[Diagnostics.Stopwatch]::StartNew()
    while($watch.Elapsed.TotalSeconds -lt 45){
        $line=[PetProbeOutput]::Next()
        if($null -eq $line){if($child.HasExited){throw "Pet closed while awaiting $type"};Start-Sleep -Milliseconds 10;continue}
        if($line.StartsWith('{')){try{$m=$line|ConvertFrom-Json}catch{continue};if($m.t -eq 'error'){throw $m.message};if($m.t -eq $type){return $m}}
    }
    throw "Missing $type"
}
try {
    [void]$child.Start()
    [PetProbeOutput]::Attach($child)
    $stderr=$child.StandardError.ReadToEndAsync()
    $ready=Read-Pet 'ready'
    $settings=@{x=$null;y=$null;scale=.65;alwaysOnTop=$true;clickThroughLocked=$true;showKeyBubbles=$true;soundEnabled=$false;autostart=$false;catBreed='dafeiyu';mcpEnabled=$false;mcpPort=27420;keyboardLayout='108';keyboardOrientation='viewer';privacyPasswordGuard=$true}
    Send-Pet @{t='settings';v=$settings;revision=1}
    $applied=Read-Pet 'applied'
    if($applied.cats.Count -ne 7 -or $applied.v.catBreed -ne 'dafeiyu' -or $applied.v.keyboardLayout -ne '108' -or $applied.v.keyboardOrientation -ne 'viewer' -or $applied.revision -ne 1){throw 'Preferences did not apply'}
    & node.exe --experimental-websocket (Join-Path $PSScriptRoot 'test-pet-render.mjs') 9235
    if($LASTEXITCODE -ne 0){throw 'Native canvas render check failed'}
    $custom=$applied.cats | Where-Object id -eq 'siamese'
    $custom.id='qa-cat';$custom.name='QA cat';$custom.builtin=$false
    Send-Pet @{t='skin';v=$custom}
    do{$state=Read-Pet 'engine'}while($state.v.catBreed -ne 'qa-cat')
    if($state.cats.Count -ne 8){throw 'Custom skin was not added'}
    Send-Pet @{t='deleteSkin';id='qa-cat'}
    do{$state=Read-Pet 'engine'}while($state.cats.Count -ne 7)
    Send-Pet @{t='pause';v=$true}
    do{$state=Read-Pet 'engine'}while(-not $state.paused)
    Send-Pet @{t='pause';v=$false}
    do{$state=Read-Pet 'engine'}while($state.paused)
    Send-Pet @{t='exit'}
    if(-not $child.WaitForExit(15000)){throw 'Pet did not exit with its host command'}
    if($child.ExitCode -ne 0){throw "Pet exit code $($child.ExitCode): $($stderr.Result)"}
    Write-Output 'PASS: real renderer startup, seven roles, scale/layout/direction, password guard settings, custom skin add/delete, pause/resume and clean shutdown'
}finally{if(-not $child.HasExited){$child.Kill()};$child.Dispose()}
