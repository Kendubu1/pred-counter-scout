using UAssetAPI;
using UAssetAPI.ExportTypes;
using UAssetAPI.Unversioned;
using System.Text.Json;
Directory.CreateDirectory(args[2]);
var enums=new Dictionary<string,UsmapEnum>();
if(args.Length>4) {
 using var doc=JsonDocument.Parse(File.ReadAllText(args[4]));
 foreach(var entry in doc.RootElement.GetProperty("enums").EnumerateObject()) {
  var values=new System.Collections.Concurrent.ConcurrentDictionary<long,string>();
  foreach(var value in entry.Value.EnumerateArray()) {
   var number=value.GetProperty("value").GetInt64();var label=value.GetProperty("name").GetString()!;
   if(!label.StartsWith(entry.Name+"::") || !values.TryAdd(number,label))throw new Exception("Invalid native enum mapping");
  }
  // UAssetAPI indexes these enum maps by numeric value; reject sparse profiles.
  for(long i=0;i<values.Count;i++)if(!values.ContainsKey(i))throw new Exception("Sparse enum profile unsupported");
  enums.Add(entry.Name,new UsmapEnum(entry.Name,values));
 }
}
var shared=new Dictionary<string,UsmapSchema>();
var ambiguous=new HashSet<string>();
var schemaErrors=new List<object>();
var sources=new Dictionary<string,string>();
foreach(var root in new[]{args[3],args[0]})
 foreach(var file in Directory.EnumerateFiles(root,"*.uasset.json",SearchOption.AllDirectories))
  sources[Path.GetRelativePath(root,file)]=file;
foreach(var file in sources.Values) {
 var json=File.ReadAllText(file);if(!json.Contains("UAssetAPI.ExportTypes.ClassExport"))continue;
 try {
 var asset=UAsset.DeserializeJson(json);
 asset.Mappings=new Usmap { Schemas=new Dictionary<string,UsmapSchema>(), EnumMap=new Dictionary<string,UsmapEnum>(enums) };
 foreach(var cls in asset.Exports.OfType<ClassExport>()) {
  var name=cls.ObjectName.ToString();
  if(ambiguous.Contains(name))continue;
  if(shared.ContainsKey(name)){shared.Remove(name);ambiguous.Add(name);continue;}
  try{shared[name]=Usmap.GetSchemaFromStructExport(cls,true);}
  catch(Exception ex){schemaErrors.Add(new {file,name,error=ex.Message});}
 }
 }catch(Exception ex){schemaErrors.Add(new {file,error=ex.Message});}
}
if(args.Length>5) {
 UsmapPropertyData NativeType(JsonElement node) {
  var kind=node.GetProperty("kind").GetInt32();
  if(kind==25)return new UsmapStructData(node.GetProperty("typeName").GetString());
  if(kind==22)return new UsmapArrayData(UsmapPropertyType.ArrayProperty){InnerType=NativeType(node.GetProperty("inner"))};
  if(kind==23)return new UsmapMapData(){InnerType=NativeType(node.GetProperty("key")),ValueType=NativeType(node.GetProperty("value"))};
  if(kind==30){var name=node.GetProperty("typeName").GetString()!;return new UsmapEnumData(name,enums[name].Values.OrderBy(x=>x.Key).Select(x=>x.Value).ToList()){InnerType=NativeType(node.GetProperty("inner"))};}
  return new UsmapPropertyData(kind switch {0=>UsmapPropertyType.ByteProperty,10=>UsmapPropertyType.FloatProperty,76=>UsmapPropertyType.BoolProperty,17 or 82=>UsmapPropertyType.ObjectProperty,16=>UsmapPropertyType.SoftObjectProperty,_=>throw new Exception("Unsupported native kind "+kind)});
 }
 using var doc=JsonDocument.Parse(File.ReadAllText(args[5]));
 var props=new System.Collections.Concurrent.ConcurrentDictionary<int,UsmapProperty>();int i=0;
 foreach(var field in (doc.RootElement.ValueKind==JsonValueKind.Array?doc.RootElement:doc.RootElement.GetProperty("fields")).EnumerateArray()){props[i]=new UsmapProperty(field.GetProperty("name").GetString(),i,0,1,NativeType(field));i++;}
 shared["PredGameplayAbility"]=new UsmapSchema("PredGameplayAbility",null,i,props,true,null);
}
File.WriteAllText(Path.Combine(args[2],"schema-library.json"),JsonSerializer.Serialize(new {count=shared.Count,ambiguous,schemaErrors}));
Console.WriteLine("Shared schemas "+shared.Count);

var summary=new List<object>();
foreach(var file in Directory.EnumerateFiles(args[0],"*.uasset.json",SearchOption.AllDirectories)) {
 var rel=Path.GetRelativePath(args[0],file);
 try {
 var a=UAsset.DeserializeJson(File.ReadAllText(file));
a.Mappings=new Usmap { Schemas=new Dictionary<string,UsmapSchema>(shared), EnumMap=new Dictionary<string,UsmapEnum>(enums) };
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
