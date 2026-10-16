using UAssetAPI;
using UAssetAPI.ExportTypes;
using UAssetAPI.Unversioned;
using System.Text.Json;
Directory.CreateDirectory(args[2]);
var summary=new List<object>();
foreach(var file in Directory.EnumerateFiles(args[0],"*.uasset.json",SearchOption.AllDirectories)) {
 var rel=Path.GetRelativePath(args[0],file);
 try {
 var a=UAsset.DeserializeJson(File.ReadAllText(file));
a.Mappings=new Usmap { Schemas=new Dictionary<string,UsmapSchema>(), EnumMap=new Dictionary<string,UsmapEnum>() };
foreach(var c in a.Exports.OfType<ClassExport>()) {
 var s=Usmap.GetSchemaFromStructExport(c,true);a.Mappings.Schemas[c.ObjectName.ToString()]=s;

}

void Add(string name, params (string name,UsmapPropertyData type)[] fields) {
 var props=new System.Collections.Concurrent.ConcurrentDictionary<int,UsmapProperty>();
 for(int i=0;i<fields.Length;i++)props[i]=new UsmapProperty(fields[i].name,i,0,1,fields[i].type);
 a.Mappings.Schemas[name]=new UsmapSchema(name,null,fields.Length,props,true,null);
}
UsmapPropertyData P(UsmapPropertyType t)=>new UsmapPropertyData(t);
Add("ActiveGameplayEffectHandle",("Handle",P(UsmapPropertyType.IntProperty)),("bPassedFiltersAndWasExecuted",P(UsmapPropertyType.BoolProperty)));
Add("ScalableFloat",("Value",P(UsmapPropertyType.FloatProperty)),("Curve",new UsmapStructData("CurveTableRowHandle")),("RegistryType",new UsmapStructData("DataRegistryType")));
Add("CurveTableRowHandle",("CurveTable",P(UsmapPropertyType.ObjectProperty)),("RowName",P(UsmapPropertyType.NameProperty)));
Add("DataRegistryType",("Name",P(UsmapPropertyType.NameProperty)));
Add("GameplayTag",("TagName",P(UsmapPropertyType.NameProperty)));
Add("PointerToUberGraphFrame");


 var records=new List<object>();
 foreach(var raw in a.Exports.OfType<RawExport>().Where(e=>e.ObjectName.ToString().StartsWith("Default__"))) {
  using var reader=a.PathToReader(Path.Combine(args[1],rel[..^5]));reader.BaseStream.Position=raw.SerialOffset;
  var header=new FUnversionedHeader(reader);
  var parent=raw.GetClassTypeForAncestry(a,out var module);
  var values=new List<object>();string stop="";bool ended=false;
  while(true){
   var start=reader.BaseStream.Position;
   try {
    var value=MainSerializer.Read(reader,null,parent,module,header,true);
    if(value==null){ended=true;break;}
    var end=reader.BaseStream.Position;
    if(end>raw.SerialOffset+raw.SerialSize)throw new Exception("Read beyond export");
    bool exact=false;string writeError="";
    try {
     using var ms=new MemoryStream();using var writer=new AssetBinaryWriter(ms,a);
     MainSerializer.Write(value,writer,true);
     exact=ms.ToArray().SequenceEqual(raw.Data.Skip((int)(start-raw.SerialOffset)).Take((int)(end-start)));
     if(!exact)writeError="Property roundtrip mismatch";
    }catch(Exception ex){writeError=ex.Message;}
    values.Add(new {name=value.Name.ToString(),offset=start-raw.SerialOffset,bytes=end-start,exact,writeError,property=JsonDocument.Parse(a.SerializeJsonObject(value)).RootElement.Clone()});
   }catch(Exception ex){stop=ex.Message;break;}
  }
  records.Add(new {name=raw.ObjectName.ToString(),ended,consumed=reader.BaseStream.Position-raw.SerialOffset,size=raw.SerialSize,stop,values});
 }
 var dest=Path.Combine(args[2],rel);Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
 File.WriteAllText(dest,JsonSerializer.Serialize(records));summary.Add(new {path=rel,status="processed"});
 }catch(Exception ex){summary.Add(new {path=rel,status="error",error=ex.GetType().Name});}
}
File.WriteAllText(Path.Combine(args[2],"manifest.json"),JsonSerializer.Serialize(summary));
Console.WriteLine("Processed "+summary.Count+" files");
